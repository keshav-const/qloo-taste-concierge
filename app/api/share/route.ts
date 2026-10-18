import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Tiny file-backed store for shared itineraries, so a share link is a short /?p=<id> instead of a
// giant base64 hash. One JSON file per id under .shares/ (gitignored).
const DIR = path.join(process.cwd(), ".shares");

function fileFor(id: string) {
  // id is our own 10-char base36; still sanitize to be safe against path traversal.
  const safe = id.replace(/[^a-z0-9]/gi, "");
  return path.join(DIR, `${safe}.json`);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itinerary = String(body?.i ?? "").trim();
    if (!itinerary) return NextResponse.json({ error: "Nothing to share." }, { status: 400 });
    const payload = {
      r: String(body?.r ?? "").slice(0, 2000),
      q: Array.isArray(body?.q) ? body.q.slice(0, 10) : [],
      i: itinerary.slice(0, 20000),
    };
    fs.mkdirSync(DIR, { recursive: true });
    const id = crypto.randomBytes(8).toString("base64url").slice(0, 10);
    fs.writeFileSync(fileFor(id), JSON.stringify(payload));
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Couldn't create share link." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const raw = fs.readFileSync(fileFor(id), "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Shared plan not found." }, { status: 404 });
  }
}
