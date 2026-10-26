import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { runAgent, deterministicPlan } from "@/lib/agent";
import { enrichWithImages } from "@/lib/images";
import { LLMError } from "@/lib/llm";

/** Map any thrown error to a user-safe message (never leak raw provider bodies). */
function friendly(e: unknown): { message: string; status: number } {
  if (e instanceof LLMError) return { message: e.userMessage, status: e.rateLimited ? 429 : 502 };
  const raw = e instanceof Error ? e.message : String(e);
  if (/Qloo/i.test(raw)) return { message: "Qloo's Taste AI is briefly unavailable — please try again.", status: 502 };
  return { message: "Something went wrong planning your trip — please try again.", status: 500 };
}

// Append one line per plan to logs/searches.jsonl — a durable record of what was searched
// and which Qloo/tool calls ran (the agent trace). Best-effort; never blocks the response.
function logSearch(entry: Record<string, unknown>) {
  try {
    const dir = path.join(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "searches.jsonl"), JSON.stringify(entry) + "\n");
  } catch {
    /* logging must never break a plan */
  }
}

// Route handlers run on the Node runtime by default, so the evidence overlay can
// read data/evidence-snapshot.json from disk. (An explicit `runtime` export is
// incompatible with Next 16's cacheComponents, so we rely on the default.)

export async function POST(req: Request) {
  try {
    const { tastes } = await req.json();
    if (!tastes || typeof tastes !== "string" || !tastes.trim()) {
      return NextResponse.json({ error: "Provide 'tastes' (a non-empty string)." }, { status: 400 });
    }
    const t0 = Date.now();
    // When the planner LLM is rate-limited, degrade to a deterministic (no-LLM) plan so the app
    // always renders every feature — verified places + proof, map, cultural scene — for a demo.
    let result;
    let offline = false;
    try {
      result = await runAgent(tastes.trim());
    } catch (e) {
      // Any LLM failure (rate-limit, empty content, provider down) → degrade to a deterministic
      // plan so the app still renders every feature. Non-LLM errors (e.g. Qloo down) bubble up.
      if (e instanceof LLMError) {
        console.warn(`[plan] planner LLM failed (${e.rateLimited ? "rate-limited" : "error"}) — serving deterministic offline plan`);
        result = await deterministicPlan(tastes.trim());
        offline = true;
      } else {
        throw e;
      }
    }
    logSearch({
      at: new Date().toISOString(),
      ms: Date.now() - t0,
      tastes: tastes.trim(),
      offline,
      trace: result.trace,
      destinations: result.destinations.map((d) => d.name),
      verifiedPlaces: result.verifiedPlaces.map((p) => p.name),
      culturalSeeds: result.culturalSeeds,
      culturalVibe: result.culturalVibe.map((c) => `${c.domain}:${c.name}`),
      culturalScene: result.culturalScene.map((h) => `${h.kind}:${h.name}${h.inSeason ? " (in-season)" : ""}`),
    });
    // Enrich with real imagery (Wikipedia) so the UI shows photos, not placeholders.
    const [destinations, verifiedPlaces, culturalVibe] = await Promise.all([
      enrichWithImages(result.destinations),
      enrichWithImages(result.verifiedPlaces),
      enrichWithImages(result.culturalVibe),
    ]);
    return NextResponse.json({ ...result, destinations, verifiedPlaces, culturalVibe, offline });
  } catch (e) {
    console.error("[plan] error:", e instanceof Error ? e.message : e);
    const { message, status } = friendly(e);
    return NextResponse.json({ error: message }, { status });
  }
}
