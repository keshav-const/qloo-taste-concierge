import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { kv } from "@/lib/kv";

// Short /?p=<id> share links. Stored in Vercel KV (Upstash) in production — the serverless
// filesystem is read-only, so the old fs-only store silently failed on Vercel. Falls back to a
// local .shares/ dir when KV isn't configured (local dev), so nothing breaks either way.
const DIR = path.join(process.cwd(), ".shares");
const TTL_SECONDS = 60 * 60 * 24 * 120; // keep shared plans ~120 days
type Payload = { r: string; q: unknown[]; i: string };

function fileFor(id: string) {
  const safe = id.replace(/[^a-z0-9]/gi, "");
  return path.join(DIR, `${safe}.json`);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const itinerary = String(body?.i ?? "").trim();
    if (!itinerary) return NextResponse.json({ error: "Nothing to share." }, { status: 400 });
    const payload: Payload = {
      r: String(body?.r ?? "").slice(0, 2000),
      q: Array.isArray(body?.q) ? body.q.slice(0, 10) : [],
      i: itinerary.slice(0, 20000),
    };
    const id = crypto.randomBytes(8).toString("base64url").slice(0, 10);

    const redis = kv();
    if (redis) {
      await redis.set(`share:${id}`, payload, { ex: TTL_SECONDS });
    } else {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(fileFor(id), JSON.stringify(payload));
    }
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "Couldn't create share link." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    const redis = kv();
    if (redis) {
      const data = await redis.get<Payload>(`share:${id}`);
      if (!data) return NextResponse.json({ error: "Shared plan not found." }, { status: 404 });
      return NextResponse.json(data);
    }
    const raw = fs.readFileSync(fileFor(id), "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Shared plan not found." }, { status: 404 });
  }
}
