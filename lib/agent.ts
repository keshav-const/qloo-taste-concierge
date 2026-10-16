// The agent — a tool-calling loop that turns cross-domain tastes into a
// personalized, creator-verified India itinerary. Qloo drives personalization;
// the evidence overlay adds verification. Server-only.

import { searchEntities, tasteExpand, entityId, EntityType, type EntityTypeUrn } from "./qloo";
import { findVerified, listVerifiedPlaces, citiesWithDepth } from "./evidence";
import { chat, type ChatMessage, type ToolDef } from "./llm";

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
          city: { type: "string", description: "Optional Indian city to focus 'place' results in, e.g. Delhi." },
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
          category: { type: "string", description: "optional keyword filter, e.g. restaurant / cafe / monument" },
          limit: { type: "number" },
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
    if (a.city) opts.locationQuery = a.city;
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
   - ALWAYS get 'destination' picks (which Indian cities/areas fit their taste).
   - Optionally get 'movie'/'tv_show'/'artist' picks to reflect their cultural vibe.
2. For on-the-ground PLACES in a city we have depth for (Delhi / Gurgaon), use get_verified_places
   as the PRIMARY source — these are real, creator-vouched spots. (For cities without depth, you may
   fall back to expand_taste with target_domain='place', and optionally check_evidence on the names.)
3. Compose a concise, warm itinerary in clean markdown:
   - Destinations section (from Qloo) and a city places section.
   - For every verified place, append " — ✓ Verified by N creators" and name what creators highlight
     (use the specialities/tips returned by the tool).

BE ECONOMICAL: aim for 3–4 tool calls total — one expand_taste for 'destination', one
get_verified_places for the focus city, and at most one more (a cultural domain). Then STOP calling
tools and write the itinerary.

STRICT HONESTY: Use ONLY facts returned by the tools. Do NOT invent festivals, claims, or details.
Keep each "why it fits" to one grounded sentence tied to the user's actual tastes. Only mark a place
verified if a tool returned it as verified.

Your FINAL message (no tool call) must be the itinerary itself, in clean markdown.`;

export type AgentResult = { itinerary: string; trace: string[] };

export async function runAgent(userInput: string, maxSteps = 6): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: userInput },
  ];
  const trace: string[] = [];

  for (let step = 0; step < maxSteps; step++) {
    const msg = await chat(messages, TOOLS);
    messages.push(msg);

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* leave {} */
        }
        trace.push(`${tc.function.name}(${(tc.function.arguments || "").slice(0, 120)})`);
        const result = await runTool(tc.function.name, parsed);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify(result),
        });
      }
      continue;
    }
    return { itinerary: msg.content ?? "", trace };
  }
  return { itinerary: "(The agent didn't converge — try rephrasing your tastes.)", trace };
}
