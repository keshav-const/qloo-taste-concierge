// The agent — a tool-calling loop that turns cross-domain tastes into a
// personalized, creator-verified India itinerary. Qloo drives personalization;
// the evidence overlay adds verification. Server-only.

import { searchEntities, tasteExpand, entityId, EntityType, type EntityTypeUrn } from "./qloo";
import {
  findVerified,
  listVerifiedPlaces,
  citiesWithDepth,
  qlooCorroborates,
  type VerifiedPlace,
} from "./evidence";
import { chat, type ChatMessage, type ToolDef } from "./llm";

export type Destination = {
  name: string;
  city: string | null;
  /** Qloo explainability — which of the user's tastes correlated to this pick. */
  why?: string;
  /** Qloo affinity 0..1 for this result, when returned. */
  affinity?: number;
};

/** A cross-domain "you'd also love" pick from Qloo (film / tv / music / book). */
export type CulturalPick = { name: string; domain: string };

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
  {
    type: "function",
    function: {
      name: "qloo_taste_graph",
      description:
        "Qloo's cross-domain taste graph. Call ONCE after you know the destination. Given the user's " +
        "taste seeds it returns (a) 'cultural' — films, shows, artists & books the user would also love " +
        "(the app shows these as a 'cultural vibe' strip, so you don't need to list them), and (b) " +
        "'qloo_places' — Qloo's own taste-matched venues in the destination city, used by the app to " +
        "corroborate and rank the creator-verified places. This is what makes Qloo visibly central.",
      parameters: {
        type: "object",
        properties: {
          seeds: {
            type: "array",
            description: "The user's tastes, each a name + its domain (same shape as expand_taste).",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", description: "music, film, tv, book, brand, place, food, or destination" },
              },
              required: ["name", "type"],
            },
          },
          city: {
            type: ["string", "null"],
            description: "Destination city for 'qloo_places' (e.g. Jaipur). null to skip venue ranking.",
          },
        },
        required: ["seeds"],
      },
    },
  },
];

type Seed = { name: string; type: string };
type ExpandArgs = { seeds?: Seed[]; target_domain?: string; city?: string };
type EvidenceArgs = { places?: string[] };

/** Resolve the user's taste seeds to Qloo entity ids, keeping the names that resolved. */
async function resolveSeeds(seeds: Seed[] = []): Promise<{ ids: string[]; names: string[] }> {
  const ids: string[] = [];
  const names: string[] = [];
  for (const s of seeds) {
    // Unknown types fall back to an untyped search (Qloo matches across all types).
    const type = SEED_TYPE[(s.type || "").toLowerCase()];
    const found = await searchEntities(s.name, type, 1);
    const id = found[0] && entityId(found[0]);
    if (id) {
      ids.push(id);
      names.push(s.name);
    }
  }
  return { ids, names };
}

async function runTool(name: string, args: unknown): Promise<unknown> {
  if (name === "expand_taste") {
    const a = args as ExpandArgs;
    const { ids: seedIds, names: seedNames } = await resolveSeeds(a.seeds);
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
      seeds_used: seedNames,
      results: ents.map((e) => ({
        name: e.name,
        city: e.properties?.geocode?.city ?? e.properties?.geocode?.name ?? null,
        country: e.properties?.geocode?.country_code ?? null,
        affinity: typeof e.query?.affinity === "number" ? e.query.affinity : undefined,
      })),
    };
  }
  if (name === "qloo_taste_graph") {
    const a = args as { seeds?: Seed[]; city?: string | null };
    const { ids: seedIds, names: seedNames } = await resolveSeeds(a.seeds);
    if (!seedIds.length) return { error: "Could not resolve any taste seeds on Qloo." };
    // (a) Cross-domain cultural picks — the "you'd also love" strip. Taste-driven, not geo.
    const domains: { key: string; type: EntityTypeUrn }[] = [
      { key: "film", type: EntityType.movie },
      { key: "tv", type: EntityType.tvShow },
      { key: "music", type: EntityType.artist },
      { key: "book", type: EntityType.book },
    ];
    const cultural: CulturalPick[] = [];
    // Strip trailing "(series, #1)"-style suffixes so titles read cleanly and image lookups hit.
    const cleanTitle = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
    await Promise.all(
      domains.map(async (d) => {
        try {
          const ents = await tasteExpand(seedIds, d.type, { take: 3 });
          for (const e of ents.slice(0, 3)) if (e.name) cultural.push({ name: cleanTitle(e.name), domain: d.key });
        } catch {
          /* skip this domain */
        }
      }),
    );
    // (b) Qloo's own taste-matched venues in the destination — used to rank verified places.
    let qlooPlaces: string[] = [];
    if (a.city) {
      try {
        const ents = await tasteExpand(seedIds, EntityType.place, { locationQuery: a.city, take: 15 });
        qlooPlaces = ents.map((e) => e.name).filter((n): n is string => !!n);
      } catch {
        /* skip venue ranking */
      }
    }
    return { cultural, qloo_places: qlooPlaces, seeds_used: seedNames };
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
3. Qloo cross-domain graph: call qloo_taste_graph ONCE with the user's seeds and city=<destination>.
   The app renders the returned cultural picks (films/shows/music/books) as a "cultural vibe" strip and
   uses qloo_places to rank the verified places — so you need NOT list them in prose. This makes Qloo
   visibly central.
4. Day-by-day narrative, WEIGHTED TO THE DESTINATION:
   - The days happen IN the destination. If it's a trip from a home city, the home city is only the
     start/end (one stop or meal at most) — NEVER 1–2 full days of the home city.
   - For a big destination (e.g. Jaipur), spread the real sights/food across the days there.
   - Name the actual places from the tools. Only mark verified what get_verified_places returned.
   - TAILOR to any trip details the user gives: length → number of days; budget → prefer places whose
     price level matches; travelers (solo/couple/friends/family) → the vibe; pace → how many stops/day.
   - When a verified place includes a best_time or price (price_level / average_cost_inr), weave it in
     naturally ("best in the evening", "around ₹300 a head").

BE ECONOMICAL: 3–5 tool calls total (include qloo_taste_graph once), then STOP and write the narrative.
STRICT HONESTY: use ONLY facts the tools returned; never invent places, festivals, or claims.
FORMAT (important): The app shows destinations + places as cards separately. Your narrative =
a warm 1–2 sentence intro, THEN one line "**Best time to visit:** <months/season + why>" for the
destination (use your general knowledge of India's seasons/festivals), then a day-by-day plan
formatted EXACTLY like this:

**Day 1 — <short theme>**
- Morning: <place/activity, one line>
- Afternoon: <...>
- Evening: <...>

**Day 2 — <short theme>**
- Morning: ...

NEVER use markdown tables or the "|" character. Each day is a bold heading followed by short
"- Morning/Afternoon/Evening:" bullet lines. Keep lines short.

Your FINAL message (no tool call) is that narrative, in clean markdown.`;

/**
 * Ask a few SHORT clarifying questions tailored to the user's request (no tools).
 * Powers the conversational step before planning.
 */
export type Suggestion = { label: string; desc: string };
export type Question = { question: string; suggestions: Suggestion[] };

const FALLBACK_QUESTIONS: Question[] = [
  {
    question: "How long is the trip?",
    suggestions: [
      { label: "A weekend", desc: "2–3 days, keep it tight" },
      { label: "A week", desc: "5–7 days, room to explore" },
    ],
  },
  {
    question: "What's the budget feel?",
    suggestions: [
      { label: "Budget", desc: "street eats, local stays" },
      { label: "Comfortable", desc: "mid-range, a few treats" },
      { label: "Splurge", desc: "fine dining, premium stays" },
    ],
  },
  {
    question: "What matters most?",
    suggestions: [
      { label: "Food", desc: "eat your way through" },
      { label: "Culture & history", desc: "monuments, museums, old quarters" },
      { label: "Relaxed vibe", desc: "slow, scenic, unhurried" },
    ],
  },
];

function extractQuestions(text: string): Question[] {
  if (!text) return [];
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .map((q): Question | null => {
        const question = String(q?.question ?? "").trim();
        if (!question) return null;
        const suggestions = Array.isArray(q?.suggestions)
          ? q.suggestions
              .map((s: unknown) => ({
                label: String((s as { label?: unknown })?.label ?? "").trim(),
                desc: String((s as { desc?: unknown })?.desc ?? "").trim(),
              }))
              .filter((s: Suggestion) => s.label)
              .slice(0, 3)
          : [];
        return { question, suggestions };
      })
      .filter((q): q is Question => q !== null)
      .slice(0, 4);
  } catch {
    return [];
  }
}

export async function generateQuestions(prompt: string): Promise<Question[]> {
  const sys = `A user gave a trip request for India. Ask 2–4 SHORT follow-up questions that make the
itinerary more personal — base them on THEIR request (specific interests, must-dos, food/diet, budget,
pace, who's coming, days). For EACH question give 2–3 quick-pick suggestions (a short label + a tiny
description). Respond with ONLY a JSON array like:
[{"question":"How many days?","suggestions":[{"label":"A weekend","desc":"2–3 days"},{"label":"A week","desc":"5–7 days"}]}]
No prose, no markdown, no keys other than question/suggestions/label/desc.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await chat(
        [
          { role: "system", content: sys },
          { role: "user", content: `Request: ${prompt}\n\nReturn the JSON array now.` },
        ],
        undefined,
        { temperature: 0.6, maxTokens: 700 },
      );
      const qs = extractQuestions(msg.content ?? "");
      if (qs.length >= 2) return qs;
    } catch {
      /* retry, then fall back */
    }
  }
  return FALLBACK_QUESTIONS;
}

/**
 * Edit an existing itinerary in ONE focused LLM call (no tools) — fast and reliably applies the
 * change, instead of re-running the whole agent with the plan stuffed into the prompt.
 */
export async function refineItinerary(currentItinerary: string, request: string, context: string): Promise<string> {
  const sys = `You are editing an India travel itinerary. Apply the user's requested change precisely
and keep everything else that already works. Keep the EXACT format: bold "**Day N — theme**" headings,
each followed by "- Morning:", "- Afternoon:", "- Evening:" bullet lines. NEVER use tables or the "|"
character. If the user asked a QUESTION (not an edit), answer it briefly at the top, then show the
(possibly unchanged) itinerary. Return ONLY markdown.`;
  const user = `Current itinerary:\n${currentItinerary}\n\nTraveller context:\n${context || "(none)"}\n\nRequested change / question: ${request}`;
  const t0 = Date.now();
  const msg = await chat([{ role: "system", content: sys }, { role: "user", content: user }], undefined, { temperature: 0.5, maxTokens: 1600 });
  console.log(`[refine] done in ${Date.now() - t0}ms`);
  return (msg.content ?? "").trim() || currentItinerary;
}

export type AgentResult = {
  itinerary: string;
  trace: string[];
  destinations: Destination[];
  verifiedPlaces: VerifiedPlace[];
  culturalVibe: CulturalPick[];
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
  const culturalVibe: CulturalPick[] = [];
  const qlooPlaceNames: string[] = []; // Qloo venue names for the destination, for cross-ranking
  const addDest = (d: Destination) => {
    if (d?.name && !destinations.some((x) => x.name === d.name)) destinations.push(d);
  };
  const addPlace = (p: VerifiedPlace) => {
    if (p?.name && !verifiedPlaces.some((x) => x.name === p.name)) verifiedPlaces.push(p);
  };
  const addCultural = (c: CulturalPick) => {
    if (c?.name && !culturalVibe.some((x) => x.name === c.name)) culturalVibe.push(c);
  };
  // Mark verified places Qloo independently recommended, and float them to the top.
  const applyQlooRanking = () => {
    if (!qlooPlaceNames.length) return;
    for (const p of verifiedPlaces) {
      if (qlooCorroborates(p.name, qlooPlaceNames)) p.qloo_ranked = true;
    }
    verifiedPlaces.sort((a, b) => Number(b.qloo_ranked ?? false) - Number(a.qloo_ranked ?? false));
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
            const r = result as { results?: Destination[]; seeds_used?: string[] };
            const why = r.seeds_used?.length
              ? `Qloo matched this to your love of ${r.seeds_used.slice(0, 3).join(", ")}`
              : undefined;
            for (const d of r.results ?? []) addDest({ ...d, why });
          }
        } else if (tc.function.name === "qloo_taste_graph") {
          const r = result as { cultural?: CulturalPick[]; qloo_places?: string[] };
          for (const c of r.cultural ?? []) addCultural(c);
          for (const n of r.qloo_places ?? []) qlooPlaceNames.push(n);
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
    applyQlooRanking();
    return { itinerary: msg.content ?? "", trace, destinations, verifiedPlaces, culturalVibe };
  }
  applyQlooRanking();
  // Didn't compose in-loop (the model kept calling tools). Compose from the data we gathered, in a
  // FRESH context (no tool-call history) so the model writes the plan instead of calling more tools.
  const dataSummary =
    `Destinations (from Qloo Taste AI): ${destinations.map((d) => d.name).join(", ") || "none"}.\n` +
    `Creator-verified places: ${verifiedPlaces.map((p) => p.name + (p.specialities?.length ? ` (${p.specialities.slice(0, 2).join(", ")})` : "")).join("; ") || "none"}.`;
  try {
    const composed = await chat(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${userInput}\n\nUse ONLY this data:\n${dataSummary}\n\nNow write the day-by-day itinerary (bold "**Day N — theme**" headings + "- Morning/Afternoon/Evening:" bullets, no tables).`,
        },
      ],
      undefined,
      { temperature: 0.5, maxTokens: 1600 },
    );
    return {
      itinerary: (composed.content ?? "").trim() || "Here are taste-matched picks for your trip — refine below to shape the plan.",
      trace,
      destinations,
      verifiedPlaces,
      culturalVibe,
    };
  } catch {
    return {
      itinerary: "Here are taste-matched picks for your trip — refine below to shape the plan.",
      trace,
      destinations,
      verifiedPlaces,
      culturalVibe,
    };
  }
}
