// Probe the LLM provider (Agnes) for basic chat + native tool-calling support.
// Run: node --env-file=.env --experimental-strip-types scripts/smoke-llm.ts
const BASE = process.env.LLM_BASE_URL!.replace(/\/$/, "");
const KEY = process.env.LLM_API_KEY!;
const MODEL = process.env.LLM_MODEL!;

async function chat(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  const text = await res.text();
  return { status: res.status, json: (() => { try { return JSON.parse(text); } catch { return text; } })() };
}

async function main() {
  console.log("1) basic completion");
  const a = await chat({ messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 10 });
  console.log(`   [${a.status}] ${a.json?.choices?.[0]?.message?.content ?? JSON.stringify(a.json).slice(0, 150)}`);

  console.log("\n2) native tool-calling");
  const b = await chat({
    messages: [{ role: "user", content: "Find restaurants in Delhi. Use the tool." }],
    tools: [{
      type: "function",
      function: {
        name: "search_places",
        description: "Search for places in a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" }, kind: { type: "string" } },
          required: ["city"],
        },
      },
    }],
    tool_choice: "auto",
    max_tokens: 150,
  });
  const msg = b.json?.choices?.[0]?.message;
  const toolCalls = msg?.tool_calls;
  if (toolCalls?.length) {
    console.log(`   [${b.status}] ✅ NATIVE TOOL-CALLING WORKS -> ${toolCalls[0].function.name}(${toolCalls[0].function.arguments})`);
  } else {
    console.log(`   [${b.status}] ⚠️ no tool_calls returned. message.content: ${(msg?.content ?? JSON.stringify(b.json)).slice(0, 200)}`);
  }
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
