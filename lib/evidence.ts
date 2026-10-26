// Creator-evidence overlay — the "verified by real creators" layer.
// Reads the static Rasta snapshot (data/evidence-snapshot.json) and matches a Qloo
// place name to a canonical POI the creators actually vouched for. Server-only.

import fs from "node:fs";
import path from "node:path";

type Claim = {
  field: string; value: string; evidence?: string | null;
  confidence?: number | null; timestamp_seconds?: number | null;
};
type Evidence = {
  stance: string; strength: number | null; claims: Claim[];
  views?: number | null; upload_date?: string | null; source_url?: string | null;
  video_id?: string | null; platform?: string | null; creator_name?: string | null;
  source_title?: string | null; timestamp_seconds?: number | null; deep_link?: string | null;
};

/** A single creator claim, flattened for the "see the proof" modal. */
export type EvidenceClaim = { label: string; value: string; quote: string | null; timestamp_seconds: number | null };
/** One source (creator video/blog) that vouched for a place, with its claims. */
export type EvidenceSource = {
  creator_name: string | null; platform: string | null; source_title: string | null;
  deep_link: string | null; timestamp_seconds: number | null; views: number | null;
  stance: string; claims: EvidenceClaim[];
};
export type CreatorVideo = {
  url: string | null;
  video_id: string | null;
  platform: string | null;
  creator_name: string | null;
  title: string | null;
  views: number | string | null;
  timestamp_seconds: number | null;
};
type Poi = {
  name: string;
  normalized_name: string;
  destination: string;
  area: string | null;
  lat?: number | null;
  lng?: number | null;
  poi_category: string | null;
  recommendation_score: number | null;
  frequency_count: number;
  specialities: string[] | null;
  tips: string[] | null;
  best_time: string | null;
  price_level: string | null;
  average_cost_inr: number | null;
  evidence: Evidence[];
  creator_video: CreatorVideo | null;
};

let CACHE: Poi[] | null = null;
function pois(): Poi[] {
  if (CACHE) return CACHE;
  const p = path.join(process.cwd(), "data", "evidence-snapshot.json");
  CACHE = (JSON.parse(fs.readFileSync(p, "utf-8")).pois as Poi[]) ?? [];
  return CACHE;
}

const SUFFIXES = new Set([
  "restaurant", "restro", "hotel", "cafe", "kitchen", "dhaba", "sweets", "bakery", "eatery",
]);

/** Mirror of the Rasta pipeline's name normalization (so matches line up). */
export function normalize(name: string): string {
  if (!name) return "";
  let s = name.toLowerCase().trim();
  s = s.replace(/^the\s+/, "").replace(/'s/g, "s").replace(/[^\w\s]/g, " ");
  s = s.replace(/\bwaali\b/g, "wali").replace(/\bvali\b/g, "wali").replace(/\s+/g, " ").trim();
  const t = s.split(" ");
  if (t.length > 1 && SUFFIXES.has(t[t.length - 1])) t.pop();
  return t.join(" ").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m ? 1 - levenshtein(a, b) / m : a === b ? 1 : 0;
}

export type Verified = {
  matched: boolean;
  name?: string;
  sources?: number;
  score?: number | null;
  category?: string | null;
  area?: string | null;
  specialities?: string[];
  tips?: string[];
  creator_summary?: string;
};

const MATCH_MIN = 0.85;

/** Is this place (by name) one the creators vouched for? Returns the evidence if so. */
export function findVerified(name: string): Verified {
  const q = normalize(name);
  if (!q) return { matched: false };
  let best: Poi | null = null;
  let bestSim = 0;
  for (const p of pois()) {
    const s = similarity(q, p.normalized_name || "");
    if (s > bestSim) {
      bestSim = s;
      best = p;
    }
  }
  if (!best || bestSim < MATCH_MIN) return { matched: false };

  const specs = (best.specialities ?? []).slice(0, 4);
  const n = best.frequency_count;
  const summary =
    `Backed by ${n} creator${n === 1 ? "" : "s"}` +
    (specs.length ? `; known for ${specs.join(", ")}` : "") +
    (best.area ? ` (${best.area})` : "");
  return {
    matched: true,
    name: best.name,
    sources: n,
    score: best.recommendation_score,
    category: best.poi_category,
    area: best.area,
    specialities: specs,
    tips: (best.tips ?? []).slice(0, 3),
    creator_summary: summary,
  };
}

const CITY_TO_DEST: Record<string, string> = {
  delhi: "delhi",
  "new delhi": "delhi",
  gurgaon: "gurgaon",
  gurugram: "gurgaon",
};

export type VerifiedPlace = {
  name: string;
  category: string | null;
  area: string | null;
  sources: number;
  score: number | null;
  specialities: string[];
  tips: string[];
  best_time: string | null;
  price_level: string | null;
  average_cost_inr: number | null;
  /** True when Qloo's Taste AI independently surfaced this place for the user's taste. */
  qloo_ranked?: boolean;
  /** The creator video that vouched for this place (deep-linked to the mention). */
  creator_video?: CreatorVideo | null;
  /** A Google Maps link for the place. */
  maps_url?: string;
  /** Coordinates (from the free Nominatim geocode pass); null when OSM had no match. */
  lat?: number | null;
  lng?: number | null;
  /** The creator sources + their exact claims that vouch for this place (for the proof modal). */
  evidence?: EvidenceSource[];
};

/** Build a Google Maps search link for a place (always works, no API). */
export function mapsUrl(name: string, city?: string | null): string {
  const q = [name, city].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Which cities we have verified depth for (for the "city depth map" + honesty). */
export function citiesWithDepth(): string[] {
  return [...new Set(pois().map((p) => p.destination))];
}

/**
 * Does Qloo's Taste AI independently corroborate this place? Fuzzy (creators use colloquial
 * names, Qloo uses formal ones), via normalized substring or high edit-similarity.
 */
export function qlooCorroborates(placeName: string, qlooNames: string[]): boolean {
  const q = normalize(placeName);
  if (!q || q.length < 3) return false;
  for (const raw of qlooNames) {
    const n = normalize(raw);
    if (!n) continue;
    if (n === q || n.includes(q) || q.includes(n)) return true;
    if (similarity(q, n) >= 0.82) return true;
  }
  return false;
}

const STOP = new Set([
  "the", "and", "for", "with", "food", "place", "places", "good", "great", "love", "like",
  "best", "delhi", "india", "want", "trip", "visit", "city", "i",
]);

/** A POI's searchable text (category + specialities + name), lowercased. */
function haystack(p: Poi): string {
  return `${p.poi_category ?? ""} ${(p.specialities ?? []).join(" ")} ${(p.tips ?? []).join(" ")} ${p.name}`.toLowerCase();
}

/**
 * The verified POIs we have for a city — the moat. When `interests` are given (cuisines,
 * dishes, vibes drawn from the user's taste), results are RANKED BY RELEVANCE to those
 * interests (then by score), so different tastes surface different places. Without
 * interests it falls back to top-scored. Optional category keyword still narrows hard.
 */
export function listVerifiedPlaces(
  opts: { city?: string; interests?: string[]; categoryLike?: string; limit?: number } = {},
): VerifiedPlace[] {
  // Map a city name to its destination slug. Known aliases (New Delhi→delhi, Gurugram→gurgaon)
  // come from CITY_TO_DEST; otherwise the slug IS the lowercased city (madurai, khajuraho, …),
  // so fall back to that instead of silently returning places from every city.
  const dest = opts.city
    ? (CITY_TO_DEST[opts.city.toLowerCase()] ?? opts.city.toLowerCase().trim())
    : undefined;
  const kw = opts.categoryLike?.toLowerCase();
  const terms = (opts.interests ?? [])
    .flatMap((s) => s.toLowerCase().split(/[\s,/&]+/))
    .map((w) => w.replace(/[^a-z]/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));

  const relevance = (p: Poi): number => {
    if (!terms.length) return 0;
    const hay = haystack(p);
    let hits = 0;
    for (const t of terms) if (hay.includes(t)) hits++;
    return hits;
  };

  const rows = pois()
    .filter((p) => (dest ? p.destination === dest : true))
    .filter((p) => (kw ? (p.poi_category ?? "").toLowerCase().includes(kw) : true))
    .map((p) => ({ p, rel: relevance(p) }))
    .sort((a, b) => b.rel - a.rel || (b.p.recommendation_score ?? 0) - (a.p.recommendation_score ?? 0))
    .slice(0, opts.limit ?? 8)
    .map((x) => x.p);

  return rows.map((p) => ({
    name: p.name,
    category: p.poi_category,
    area: p.area,
    sources: p.frequency_count,
    score: p.recommendation_score,
    specialities: (p.specialities ?? []).slice(0, 4),
    tips: (p.tips ?? []).slice(0, 2),
    best_time: p.best_time,
    price_level: p.price_level,
    average_cost_inr: p.average_cost_inr,
    creator_video: p.creator_video ?? null,
    maps_url: mapsUrl(p.name, p.destination),
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    evidence: (p.evidence ?? []).slice(0, 3).map((e) => ({
      creator_name: e.creator_name ?? null,
      platform: e.platform ?? null,
      source_title: e.source_title ?? null,
      deep_link: e.deep_link ?? e.source_url ?? null,
      timestamp_seconds: e.timestamp_seconds ?? null,
      views: e.views ?? null,
      stance: e.stance,
      claims: (e.claims ?? []).slice(0, 5).map((c) => ({
        label: c.field,
        value: c.value,
        quote: c.evidence ?? null,
        timestamp_seconds: c.timestamp_seconds ?? null,
      })),
    })),
  }));
}

/** Coverage summary for the "city depth map" — how many verified POIs per area. */
export function coverage(): { destination: string; areas: Record<string, number>; total: number } {
  const all = pois();
  const areas: Record<string, number> = {};
  for (const p of all) areas[p.area ?? "—"] = (areas[p.area ?? "—"] ?? 0) + 1;
  return { destination: "Delhi NCR", areas, total: all.length };
}
