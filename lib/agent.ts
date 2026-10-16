// The agent — a tool-calling loop that turns cross-domain tastes into a
// personalized, creator-verified India itinerary. Qloo drives personalization;
// the evidence overlay adds verification. Server-only.

import { searchEntities, tasteExpand, entityId, EntityType, type EntityTypeUrn } from "./qloo";
import {
  findVerified,
  listVerifiedPlaces,
  citiesWithDepth,
  type VerifiedPlace,
} from "./evidence";
import { chat, type ChatMessage, type ToolDef } from "./llm";

export type Destination = { name: string; city: string | null };

// Map the model's friendly domain words -> Qloo entity-type URNs.
const SEED_TYPE: Record<string, EntityTypeUrn> = {
  music: EntityType.artist,
  artist: EntityType.artist,
  band: EntityType.artist,
  song: EntityType.artist,
  film: EntityType.movie,
  movie: EntityType.movie,
  tv: EntityType.tvShow,
  show: EntityType.tvShow,
  book: EntityType.book,
  author: EntityType.book,
  brand: EntityType.brand,
  fashion: EntityType.brand,
  place: EntityType.place,
  food: EntityType.place,
  cuisine: EntityType.place,
  restaurant: EntityType.place,
  destination: EntityType.destination,
  travel: EntityType.destination,
  city: EntityType.destination,
};
const TARGET_TYPE: Record<string, EntityTypeUrn> = {
  destination: EntityType.destination,
  place: EntityType.place,
  movie: EntityType.movie,
  tv_show: EntityType.tvShow,
  artist: EntityType.artist,
  book: EntityType.book,
  brand: EntityType.brand,
};

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "expand_taste",
      description:
        "Turn the user's taste seeds into Qloo recommendations in a target domain. " +
        "Use it to get Indian 'destination' picks (cities/areas to visit), 'place' picks " +
        "(venues; pass a city to focus), and optionally 'movie'/'tv_show'/'artist' picks for cultural vibe.",
      parameters: {
        type: "object",
        properties: {
          seeds: {
            type: "array",
            description: "The user's tastes, each a name + its domain.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: {
                  type: "string",
                  description: "domain of this taste: music, film, tv, book, brand, place, food, or destination",
                },
              },
              required: ["name", "type"],
            },
          },
          target_domain: {
            type: "string",
            description: "one of: destination, place, movie, tv_show, artist, book, brand",
          },
          city: {
            type: ["string", "null"],
            description: "Optional Indian city to focus 'place' results in, e.g. Delhi. Omit/null for destinations.",
          },
        },
        required: ["seeds", "target_domain"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_verified_places",
      description:
        "PRIMARY source for on-the-ground places in a city we have verified depth for " +
        `(currently: ${citiesWithDepth().join(", ")}). Returns real POIs vouched for by creators, ` +
        "each with a sources count and what creators highlight. Prefer this over expand_taste for " +
        "places in these cities. Optionally filter by category keyword (e.g. 'restaurant', 'cafe', " +
        "'monument', 'market').",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "e.g. Delhi or Gurgaon" },
          category: {
            type: ["string", "null"],
            description: "optional keyword filter, e.g. restaurant / cafe / monument",
          },
          limit: { type: ["number", "null"] },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_evidence",
      description:
        "Secondary: check whether specific place NAMES (e.g. ones returned by expand_taste) are " +
        "verified by creators. Delhi NCR coverage only; unknown names return no match.",
      parameters: {
        type: "object",
        properties: { places: { type: "array", items: { type: "string" } } },
        required: ["places"],
      },
    },
  },
];

type ExpandArgs = { seeds?: { name: string; type: string }[]; target_domain?: string; city?: string };
type EvidenceArgs = { places?: string[] };

async function runTool(name: string, args: unknown): Promise<unknown> {
  if (name === "expand_taste") {
    const a = args as ExpandArgs;
    const seedIds: string[] = [];
    for (const s of a.seeds ?? []) {
      // Unknown types fall back to an untyped search (Qloo matches across all types).
      const type = SEED_TYPE[(s.type || "").toLowerCase()];
      const found = await searchEntities(s.name, type, 1);
      const id = found[0] && entityId(found[0]);
      if (id) seedIds.push(id);
    }
    if (!seedIds.length) return { error: "Could not resolve any taste seeds on Qloo." };
    const target = TARGET_TYPE[a.target_domain ?? "destination"] ?? EntityType.destination;
    const opts: Record<string, unknown> = { take: 6 };
    // Destinations are always India-wide (never narrowed to the focus city); a city
    // filter only makes sense for 'place' results.
    if (target === EntityType.destination) opts.countryCode = "IN";
    else if (a.city) opts.locationQuery = a.city;
    else opts.countryCode = "IN";
    const ents = await tasteExpand(seedIds, target, opts);
    return {
      results: ents.map((e) => ({
        name: e.name,
        city: e.properties?.geocode?.city ?? e.properties?.geocode?.name ?? null,
        country: e.properties?.geocode?.country_code ?? null,
      })),
    };
  }
  if (name === "get_verified_places") {
    const a = args as { city?: string; category?: string; limit?: number };
    // Cap server-side to keep tool-result tokens small (free-tier TPM).
    const limit = Math.min(a.limit ?? 8, 10);
    const places = listVerifiedPlaces({ city: a.city, categoryLike: a.category, limit });
    return { city: a.city, verified_places: places };
  }
  if (name === "check_evidence") {
    const a = args as EvidenceArgs;
    const verified = (a.places ?? [])
      .map((p) => ({ place: p, ...findVerified(p) }))
      .filter((x) => x.matched);
    return { verified };
  }
  return { error: `unknown tool: ${name}` };
}

const SYSTEM = `You are a taste-driven travel & culture concierge for India, powered by Qloo's Taste AI.
We have our OWN creator-verified place data for: ${citiesWithDepth().join(", ")}.

Given the user's tastes (music, film, TV, food, fashion, travel — any mix), build a personalized itinerary:

1. Call expand_taste to turn their tastes into Qloo picks:
   - ALWAYS get 'destination' picks — these are INDIA-WIDE places to travel (do NOT pass a city for
     destinations; the focus city is only for on-the-ground places).
   - Optionally get 'movie'/'tv_show'/'artist' picks to reflect their cultural vibe.
2. For on-the-ground PLACES in a city we have depth for (Delhi / Gurgaon), use get_verified_places
   as the PRIMARY source — these are real, creator-vouched spots. (For cities without depth, you may
   fall back to expand_taste with target_domain='place', and optionally check_evidence on the names.)
3. Then write a SHORT narrative (the app shows the destinations and verified places as cards
   separately, so do NOT re-list them in big tables). The narrative = a warm 1–2 sentence intro
   tied to their tastes + a concise **day-by-day plan** (Day 1 / Day 2 / Day 3) weaving in the
   verified Delhi places by name. Use light markdown (a few bold names, short lines). No tables.

BE ECONOMICAL: aim for 3–4 tool calls total — one expand_taste for 'destination', one
get_verified_places for the focus city, and at most one more (a cultural domain). Then STOP calling
tools and write the narrative.

STRICT HONESTY: Use ONLY facts returned by the tools. Do NOT invent festivals, claims, or details.
Tie each mention to the user's actual tastes in one grounded phrase.

Your FINAL message (no tool call) is that narrative, in clean markdown.`;

export type AgentResult = {
  itinerary: string;
  trace: string[];
  destinations: Destination[];
  verifiedPlaces: VerifiedPlace[];
};

export async function runAgent(userInput: string, maxSteps = 6): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userInput },
  ];
  const trace: string[] = [];
  // Capture structured results so the UI can render styled cards/badges, not a blob.
  const destinations: Destination[] = [];
  const verifiedPlaces: VerifiedPlace[] = [];
  const addDest = (d: Destination) => {
    if (d?.name && !destinations.some((x) => x.name === d.name)) destinations.push(d);
  };
  const addPlace = (p: VerifiedPlace) => {
    if (p?.name && !verifiedPlaces.some((x) => x.name === p.name)) verifiedPlaces.push(p);
  };

  for (let step = 0; step < maxSteps; step++) {
    const msg = await chat(messages, TOOLS);
    messages.push(msg);

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* leave {} */
        }
        trace.push(`${tc.function.name}(${(tc.function.arguments || "").slice(0, 120)})`);
        const result = await runTool(tc.function.name, parsed);

        // Harvest structured data for the UI.
        if (tc.function.name === "get_verified_places") {
          for (const p of (result as { verified_places?: VerifiedPlace[] }).verified_places ?? [])
            addPlace(p);
        } else if (tc.function.name === "expand_taste") {
          const td = parsed.target_domain;
          if (!td || td === "destination") {
            for (const d of (result as { results?: Destination[] }).results ?? []) addDest(d);
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }
    return { itinerary: msg.content ?? "", trace, destinations, verifiedPlaces };
  }
  return {
    itinerary: "(The agent didn't converge — try rephrasing your tastes.)",
    trace,
    destinations,
    verifiedPlaces,
  };
}
