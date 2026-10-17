import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { runAgent } from "@/lib/agent";
import { enrichWithImages } from "@/lib/images";

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
    const result = await runAgent(tastes.trim());
    logSearch({
      at: new Date().toISOString(),
      ms: Date.now() - t0,
      tastes: tastes.trim(),
      trace: result.trace,
      destinations: result.destinations.map((d) => d.name),
      verifiedPlaces: result.verifiedPlaces.map((p) => p.name),
      culturalSeeds: result.culturalSeeds,
      culturalVibe: result.culturalVibe.map((c) => `${c.domain}:${c.name}`),
    });
    // Enrich with real imagery (Wikipedia) so the UI shows photos, not placeholders.
    const [destinations, verifiedPlaces, culturalVibe] = await Promise.all([
      enrichWithImages(result.destinations),
      enrichWithImages(result.verifiedPlaces),
      enrichWithImages(result.culturalVibe),
    ]);
    return NextResponse.json({ ...result, destinations, verifiedPlaces, culturalVibe });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
