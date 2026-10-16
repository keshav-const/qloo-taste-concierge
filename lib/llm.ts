// OpenAI-compatible chat client (Groq by default). Server-only.
// Provider swap = env vars only (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL).

const BASE = (process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
const KEY = process.env.LLM_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";

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

export async function chat(
  messages: ChatMessage[],
  tools?: ToolDef[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatMessage> {
  if (!KEY) throw new Error("LLM_API_KEY is not set");
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: opts.temperature ?? 0.55,
    max_tokens: opts.maxTokens ?? 1800,
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      return json.choices?.[0]?.message as ChatMessage;
    }
    const text = await res.text().catch(() => "");
    // Groq gpt-oss sometimes leaks its "commentary" reasoning channel as a bogus tool call
    // (400 tool_use_failed). It's intermittent, so a quick retry usually yields a valid call.
    const toolGlitch =
      res.status === 400 && /tool_use_failed|was not in request\.tools|commentary/i.test(text);
    // Retry on rate limit (respect the suggested wait), transient 5xx, and the tool glitch.
    if ((res.status === 429 || res.status >= 500 || toolGlitch) && attempt < 3) {
      const suggested = Number(/try again in ([\d.]+)s/i.exec(text)?.[1]);
      const waitMs = Number.isFinite(suggested)
        ? suggested * 1000 + 400
        : toolGlitch
          ? 350
          : 1200 * (attempt + 1);
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 12000)));
      continue;
    }
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error("LLM: exhausted retries");
}
