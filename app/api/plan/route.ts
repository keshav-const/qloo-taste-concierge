import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { enrichWithImages } from "@/lib/images";

// Route handlers run on the Node runtime by default, so the evidence overlay can
// read data/evidence-snapshot.json from disk. (An explicit `runtime` export is
// incompatible with Next 16's cacheComponents, so we rely on the default.)

export async function POST(req: Request) {
  try {
    const { tastes } = await req.json();
    if (!tastes || typeof tastes !== "string" || !tastes.trim()) {
      return NextResponse.json({ error: "Provide 'tastes' (a non-empty string)." }, { status: 400 });
    }
    const result = await runAgent(tastes.trim());
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
