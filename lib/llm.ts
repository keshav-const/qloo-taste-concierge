// OpenAI-compatible chat client with a FALLBACK provider. Server-only.
// Primary = Groq (fast, tool-calling). Fallback = Gemini (set LLM_FALLBACK_*), used when the
// primary is rate-limited/exhausted so the demo keeps working. Both speak the OpenAI chat API.

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type Provider = { base: string; key: string; model: string; label: string };
const GROQ = "https://api.groq.com/openai/v1";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai";

function mkProvider(prefix: string, defBase: string, defModel: string, label: string): Provider | null {
  const key = process.env[`${prefix}_API_KEY`];
  if (!key) return null;
  return {
    base: (process.env[`${prefix}_BASE_URL`] ?? defBase).replace(/\/$/, ""),
    key,
    model: process.env[`${prefix}_MODEL`] ?? defModel,
    label,
  };
}

// Ordered chain: primary, then fallbacks. Groq rate-limits are PER-MODEL, so a second Groq
// model (qwen) has its own daily quota — a free way to stay up when gpt-oss-120b is capped.
const PROVIDERS: Provider[] = [
  mkProvider("LLM", GROQ, "openai/gpt-oss-120b", "primary"),
  mkProvider("LLM_FALLBACK", GROQ, "openai/gpt-oss-20b", "fallback-1"),
  mkProvider("LLM_FALLBACK2", GEMINI, "gemini-3.6-flash", "fallback-2"),
].filter((p): p is Provider => !!p);

/** A friendly, user-safe error. Routes should surface `.userMessage`, never the raw body. */
export class LLMError extends Error {
  userMessage: string;
  rateLimited: boolean;
  constructor(message: string, userMessage: string, rateLimited = false) {
    super(message);
    this.name = "LLMError";
    this.userMessage = userMessage;
    this.rateLimited = rateLimited;
  }
}

// When a provider reports a long/daily rate limit, skip it until this time (avoid hammering it).
const cooldownUntil = new Map<string, number>();

function parseRetryMs(text: string): number | null {
  const m = /try again in (?:(\d+)m)?\s*([\d.]+)s/i.exec(text) ?? /try again in ([\d.]+)s/i.exec(text);
  if (!m) return null;
  if (m.length === 3 && m[1]) return (Number(m[1]) * 60 + Number(m[2])) * 1000;
  return Number(m[m.length - 1]) * 1000;
}

async function callProvider(
  p: Provider,
  messages: ChatMessage[],
  tools?: ToolDef[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatMessage> {
  const body: Record<string, unknown> = {
    model: p.model,
    messages,
    temperature: opts.temperature ?? 0.55,
    max_tokens: opts.maxTokens ?? 1800,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      const msg = json.choices?.[0]?.message as ChatMessage | undefined;
      if (!msg) throw new LLMError(`${p.label}: empty choices`, "The planner returned nothing — please try again.");
      return msg;
    }
    const text = await res.text().catch(() => "");

    if (res.status === 429) {
      const waitMs = parseRetryMs(text);
      const daily = /per day|TPD|tokens per day|quota/i.test(text);
      // Long wait or a daily cap → don't wait; bubble up so chat() can fall back to the other provider.
      if (daily || (waitMs ?? 99999) > 8000 || attempt >= 2) {
        if (daily || (waitMs ?? 0) > 60000) cooldownUntil.set(p.label, Date.now() + Math.min(waitMs ?? 300000, 600000));
        throw new LLMError(
          `${p.label} 429: ${text.slice(0, 160)}`,
          "Our planner hit its rate limit for now. I've switched to the backup model — if this persists, try again in a few minutes.",
          true,
        );
      }
      await new Promise((r) => setTimeout(r, (waitMs ?? 1200 * (attempt + 1)) + 300));
      continue;
    }

    // Groq gpt-oss sometimes leaks its "commentary" channel as a bogus tool call (400). Quick retry.
    const toolGlitch = res.status === 400 && /tool_use_failed|was not in request\.tools|commentary/i.test(text);
    if ((res.status >= 500 || toolGlitch) && attempt < 3) {
      await new Promise((r) => setTimeout(r, toolGlitch ? 350 : 1200 * (attempt + 1)));
      continue;
    }
    throw new LLMError(`${p.label} ${res.status}: ${text.slice(0, 200)}`, "The planner had trouble — please try again.", res.status === 429);
  }
  throw new LLMError(`${p.label}: exhausted retries`, "The planner is busy right now — please try again in a moment.", true);
}

export async function chat(
  messages: ChatMessage[],
  tools?: ToolDef[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatMessage> {
  if (!PROVIDERS.length) throw new LLMError("no provider configured", "AI isn't configured on the server.");
  const now = Date.now();
  // Try providers not on cooldown first, then any cooled-down ones as a last resort.
  const ready = PROVIDERS.filter((p) => (cooldownUntil.get(p.label) ?? 0) <= now);
  const cooled = PROVIDERS.filter((p) => (cooldownUntil.get(p.label) ?? 0) > now);
  const order = [...ready, ...cooled];

  let lastErr: unknown;
  for (const p of order) {
    try {
      return await callProvider(p, messages, tools, opts);
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] ${p.label} failed (${e instanceof Error ? e.message.slice(0, 120) : e}) — ${p === order[order.length - 1] ? "no more providers" : "trying fallback"}`);
    }
  }
  throw lastErr instanceof LLMError
    ? lastErr
    : new LLMError(String(lastErr), "The planner is unavailable right now — please try again shortly.", false);
}
