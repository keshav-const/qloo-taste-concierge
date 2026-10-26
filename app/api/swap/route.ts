import { NextResponse } from "next/server";
import { listVerifiedPlaces } from "@/lib/evidence";
import { enrichWithImages } from "@/lib/images";

/**
 * Swap a verified place for another taste-ranked alternative in the same city — deterministic,
 * no LLM. Powers the "⟳ Swap" re-roll on place cards so a user can explore without re-planning.
 */
export async function POST(req: Request) {
  try {
    const { city, interests, exclude } = await req.json();
    const excludeSet = new Set<string>(Array.isArray(exclude) ? exclude.map((s: string) => String(s).toLowerCase()) : []);
    const pool = listVerifiedPlaces({
      city: typeof city === "string" && city ? city : undefined,
      interests: typeof interests === "string" && interests ? [interests] : undefined,
      limit: 40,
    });
    const next = pool.find((p) => !excludeSet.has(p.name.toLowerCase()));
    if (!next) return NextResponse.json({ place: null });
    const [place] = await enrichWithImages([next]);
    return NextResponse.json({ place });
  } catch {
    return NextResponse.json({ place: null }, { status: 200 });
  }
}
