import { NextResponse } from "next/server";
import { chat } from "@/lib/llm";

/** Extract a JSON object from a model reply (handles ```json fences / prose wrappers). */
function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * A tiny "local culture pack" for a destination — a greeting + a couple of phrases, etiquette and
 * food must-tries. Uses the FREE LLM tier (not the paid OpenAI planner key). Best-effort: returns
 * { pack: null } if the model is unavailable, so the UI can just skip the section.
 */
export async function POST(req: Request) {
  try {
    const { city } = await req.json();
    if (!city || typeof city !== "string") return NextResponse.json({ pack: null });
    const sys = `You give a short, accurate "local pack" for a place in India as STRICT JSON only:
{"greeting":{"local":"नमस्ते","roman":"Namaste","en":"Hello"},
 "phrases":[{"local":"...","roman":"...","en":"Thank you"}],
 "etiquette":["one short tip","another short tip"],
 "food":["Dish 1","Dish 2","Dish 3"]}
Use the locally-spoken language (e.g. Kashmiri for Srinagar, Tamil for Madurai, Bengali for Kolkata).
2-3 phrases, 2 etiquette tips, 3 iconic local dishes. No prose, no markdown — JSON object only.`;
    // Two attempts — the free tiers can transiently rate-limit; a second try usually lands.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const msg = await chat(
          [
            { role: "system", content: sys },
            { role: "user", content: `Local pack for ${city}, India. JSON only.` },
          ],
          undefined,
          { temperature: 0.4, maxTokens: 500, freeOnly: true },
        );
        const pack = parseJson(msg.content ?? "");
        if (pack) return NextResponse.json({ pack });
      } catch {
        /* try again, then give up */
      }
    }
    return NextResponse.json({ pack: null });
  } catch {
    return NextResponse.json({ pack: null });
  }
}
