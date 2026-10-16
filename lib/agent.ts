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
          interests: {
            type: ["array", "null"],
            items: { type: "string" },
            description:
              "IMPORTANT for relevance: the user's food/place interests drawn from their taste — " +
              "cuisines, dishes, vibes (e.g. ['street food','kebab','mughlai'] or ['cafe','coffee','chill'] " +
              "or ['history','monuments']). Places are ranked to match these, so different tastes get different places.",
          },
          category: {
            type: ["string", "null"],
            description: "optional hard category filter, e.g. restaurant / cafe / monument",
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
    const opts: Record<string, unknown> = { take: 8 };
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
    const a = args as { city?: string; interests?: string[]; category?: string; limit?: number };
    // Cap server-side to keep tool-result tokens small (free-tier TPM).
    const limit = Math.min(a.limit ?? 8, 10);
    const places = listVerifiedPlaces({
      city: a.city,
      interests: a.interests ?? undefined,
      categoryLike: a.category ?? undefined,
      limit,
    });
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
We have our OWN creator-verified place data ONLY for these DEPTH CITIES: ${citiesWithDepth().join(", ")}.

STEP A — Identify the DESTINATION (India-wide — do NOT assume Delhi):
- If they name a city to visit (e.g. "plan my Jaipur trip"), the DESTINATION is THAT city. Any home
  city is only a departure point — never fill days with the home city.
- If they name NO destination, do NOT default to any one city. Lead with India-wide taste-matched
  destinations (from expand_taste) and pick the single strongest match as the DESTINATION to plan —
  it can be anywhere in India, not necessarily a depth city.

STEP B — Build the plan FOR THAT DESTINATION:
1. expand_taste target_domain='destination' (India-wide, no city arg) — a few taste-matched cities to
   inspire them. This is side inspiration, not the main plan.
2. On-the-ground PLACES in the DESTINATION:
   - If the destination IS one of our depth cities (${citiesWithDepth().join(" / ")}): call
     get_verified_places for it, ALWAYS passing an 'interests' list from the user's tastes (cuisines,
     dishes, vibes — e.g. ['street food','kebab'], ['cafe','coffee'], ['history','monuments']). These
     are creator-verified; mark them "✓ verified by creators".
   - OTHERWISE (e.g. Jaipur, Goa, Udaipur): call expand_taste target_domain='place' with city=<destination>
     to get Qloo places THERE. These are taste-matched but NOT creator-verified — present them as
     suggestions and be honest we don't have verified depth outside ${citiesWithDepth().join(" / ")} yet.
3. Day-by-day narrative, WEIGHTED TO THE DESTINATION:
   - The days happen IN the destination. If it's a trip from a home city, the home city is only the
     start/end (one stop or meal at most) — NEVER 1–2 full days of the home city.
   - For a big destination (e.g. Jaipur), spread the real sights/food across the days there.
   - Name the actual places from the tools. Only mark verified what get_verified_places returned.
   - TAILOR to any trip details the user gives: length → number of days; budget → prefer places whose
     price level matches; travelers (solo/couple/friends/family) → the vibe; pace → how many stops/day.
   - When a verified place includes a best_time or price (price_level / average_cost_inr), weave it in
     naturally ("best in the evening", "around ₹300 a head").

BE ECONOMICAL: 3–4 tool calls total, then STOP and write the narrative.
STRICT HONESTY: use ONLY facts the tools returned; never invent places, festivals, or claims.
The app shows destinations + places as cards separately, so the narrative = a warm 1–2 sentence intro
+ a concise **day-by-day plan** in light markdown (bold names, short lines). No big tables.

Your FINAL message (no tool call) is that narrative, in clean markdown.`;

/**
 * Ask a few SHORT clarifying questions tailored to the user's request (no tools).
 * Powers the conversational step before planning.
 */
export async function generateQuestions(prompt: string): Promise<string[]> {
  const sys = `A user gave a trip request for India. Ask exactly 3 SHORT, specific follow-up questions
that would make their itinerary much more personal. Base them on THEIR request — probe what's
ambiguous or missing (specific interests within their stated vibe, must-dos, food/diet, budget feel,
pace, who's coming, how many days if unclear). Each question under 12 words. Friendly, concrete.
Return ONLY a JSON array of exactly 3 strings — no prose, no keys.`;
  const msg = await chat(
    [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
    undefined,
    { temperature: 0.6, maxTokens: 300 },
  );
  const text = msg.content ?? "";
  try {
    const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    return Array.isArray(arr) ? arr.slice(0, 3).map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

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
        let result: unknown;
        try {
          result = await runTool(tc.function.name, parsed);
        } catch (e) {
          // A single tool failure must not crash the plan — hand the error back to the LLM.
          result = { error: e instanceof Error ? e.message : String(e) };
        }

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
