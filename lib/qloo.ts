// Qloo Taste AI client — Hackathon API (https://hackathon.api.qloo.com).
// Params below are the ones verified live on 2026-10-16 (see HACKATHON_CONTEXT.md §11).
// Server-only: reads the API key from the environment; never import into client code.

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY ?? "";

export type QlooGeocode = {
  city?: string;
  name?: string;
  country_code?: string;
};

export type QlooEntity = {
  entity_id?: string;
  id?: string;
  name?: string;
  types?: string[];
  properties?: {
    geocode?: QlooGeocode;
    image?: { url?: string } | string;
    description?: string;
    [k: string]: unknown;
  };
  // affinity/score live under query.* on insights results
  query?: { affinity?: number; [k: string]: unknown };
  [k: string]: unknown;
};

// Entity-type URNs enabled for the hackathon.
export const EntityType = {
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  brand: "urn:entity:brand",
  destination: "urn:entity:destination",
  movie: "urn:entity:movie",
  person: "urn:entity:person",
  place: "urn:entity:place",
  podcast: "urn:entity:podcast",
  tvShow: "urn:entity:tv_show",
  videoGame: "urn:entity:video_game",
  locality: "urn:entity:locality",
} as const;

export type EntityTypeUrn = (typeof EntityType)[keyof typeof EntityType];

function qlooUrl(path: string, params: Record<string, string | number | undefined>) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  return url;
}

async function qlooGet(path: string, params: Record<string, string | number | undefined>) {
  if (!KEY) throw new Error("QLOO_API_KEY is not set");
  const res = await fetch(qlooUrl(path, params), { headers: { "X-Api-Key": KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qloo ${path} -> ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Insights nests entities under results.entities; search returns results as an array.
function extractEntities(json: unknown): QlooEntity[] {
  const r = (json as { results?: unknown })?.results;
  if (Array.isArray(r)) return r as QlooEntity[];
  const nested = (r as { entities?: unknown })?.entities;
  return Array.isArray(nested) ? (nested as QlooEntity[]) : [];
}

export function entityId(e: QlooEntity): string | undefined {
  return e.entity_id ?? e.id;
}

/** Resolve a free-text name to Qloo entities (to use as taste seeds). */
export async function searchEntities(
  query: string,
  types?: EntityTypeUrn | EntityTypeUrn[],
  take = 5,
): Promise<QlooEntity[]> {
  const typesParam = Array.isArray(types) ? types.join(",") : types;
  return extractEntities(await qlooGet("/search", { query, types: typesParam, take }));
}

/** Resolve a name to a single entity id, or null. */
export async function resolveEntityId(
  name: string,
  type: EntityTypeUrn,
): Promise<string | null> {
  const found = await searchEntities(name, type, 1);
  return found.length ? (entityId(found[0]) ?? null) : null;
}

export type InsightsOpts = {
  filterType: EntityTypeUrn; // the TARGET domain you want back
  signalEntities?: string[]; // seed entity ids (cross-domain allowed)
  signalTags?: string[]; // tag URNs
  /** Fuzzy locality name, e.g. "Delhi". The RELIABLE geo filter (geocode.name silently returns 0). */
  locationQuery?: string;
  /** A locality entity id or WKT POINT — alternative to locationQuery. */
  location?: string;
  countryCode?: string; // e.g. "IN" (use alone, NOT combined with a city name)
  popularityMin?: number; // 0..1 percentile — raise for more notable results
  take?: number;
};

/** Core Insights call. filterType sets the domain returned; seeds drive the correlation. */
export async function insights(opts: InsightsOpts): Promise<QlooEntity[]> {
  const params: Record<string, string | number | undefined> = {
    "filter.type": opts.filterType,
    take: opts.take ?? 10,
  };
  if (opts.signalEntities?.length)
    params["signal.interests.entities"] = opts.signalEntities.join(",");
  if (opts.signalTags?.length) params["signal.interests.tags"] = opts.signalTags.join(",");
  if (opts.locationQuery) params["filter.location.query"] = opts.locationQuery;
  if (opts.location) params["filter.location"] = opts.location;
  if (opts.countryCode) params["filter.geocode.country_code"] = opts.countryCode;
  if (opts.popularityMin !== undefined) params["filter.popularity.min"] = opts.popularityMin;
  return extractEntities(await qlooGet("/v2/insights", params));
}

/** Convenience: cross-domain taste expansion from seed ids into a target domain. */
export async function tasteExpand(
  seedEntityIds: string[],
  targetType: EntityTypeUrn,
  opts: Omit<Partial<InsightsOpts>, "filterType" | "signalEntities"> = {},
): Promise<QlooEntity[]> {
  return insights({ filterType: targetType, signalEntities: seedEntityIds, ...opts });
}
