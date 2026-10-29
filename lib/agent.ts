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
import {
  culturalScene,
  inferMonth,
  inferRegion,
  tasteDomains,
  pickTrail,
  type CulturalHighlight,
  type CulturalTrail,
} from "./culture";

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
            description:
              "The user's tastes, each a name + its domain. IMPORTANT: for the cultural strip to be " +
              "meaningful, include the user's GENUINE cultural tastes — specific artists/bands, films, " +
              "shows, books or brands they actually named (type music/film/tv/book/brand). Do NOT invent " +
              "any. You may also pass place/food/destination seeds (used only for venue ranking).",
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
  {
    type: "function",
    function: {
      name: "cultural_scene",
      description:
        "The LIVING cultural scene in the destination — real festivals, music/film/dance/literature " +
        "seasons and cultural venues (museums, theatres, art spaces) curated for that city/region. " +
        "Call ONCE after you know the destination. Returns items flagged 'in_season' when the trip's " +
        "month overlaps the event, and 'matches_taste' when it fits the user's cultural interests. Use " +
        "it to honestly weave in timely culture (e.g. 'you're there in December — the Margazhi season " +
        "is on'). The app also renders these as a 'cultural scene' panel.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Destination city, e.g. Chennai, Kochi, Jaipur." },
          month: {
            type: ["number", "null"],
            description: "Trip month as 1–12 if the user implied timing (e.g. December=12); else null.",
          },
          interests: {
            type: ["array", "null"],
            items: { type: "string" },
            description:
              "The user's cultural interest words (e.g. ['classical music','museums','theatre']) so " +
              "matching items are flagged. Omit/null if unknown.",
          },
        },
        required: ["city"],
      },
    },
  },
];

type Seed = { name: string; type: string };
type ExpandArgs = { seeds?: Seed[]; target_domain?: string; city?: string };
type EvidenceArgs = { places?: string[] };

type ResolvedSeed = { id: string; name: string; type: string };

/** The seed domains that are genuine CULTURAL tastes (vs trip logistics like place/food/city). */
const CULTURAL_SEED_TYPES = new Set([
  "music", "artist", "band", "song", "film", "movie", "tv", "show", "book", "author", "brand", "fashion",
]);

/** Resolve the user's taste seeds to Qloo entity ids, keeping each seed's name + domain. */
async function resolveSeeds(seeds: Seed[] = []): Promise<ResolvedSeed[]> {
  const out: ResolvedSeed[] = [];
  for (const s of seeds) {
    const typeKey = (s.type || "").toLowerCase();
    // Unknown types fall back to an untyped search (Qloo matches across all types).
    const found = await searchEntities(s.name, SEED_TYPE[typeKey], 1);
    const id = found[0] && entityId(found[0]);
    if (id) out.push({ id, name: s.name, type: typeKey });
  }
  return out;
}

async function runTool(name: string, args: unknown): Promise<unknown> {
  if (name === "expand_taste") {
    const a = args as ExpandArgs;
    const resolved = await resolveSeeds(a.seeds);
    const seedIds = resolved.map((r) => r.id);
    const seedNames = resolved.map((r) => r.name);
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
    const resolved = await resolveSeeds(a.seeds);
    const allIds = resolved.map((r) => r.id);
    if (!allIds.length) return { error: "Could not resolve any taste seeds on Qloo." };

    // (a) Cross-domain cultural picks — ONLY from genuine cultural tastes (music/film/tv/book/brand).
    // Trip logistics (place/food/city/"spiritual sites") are NOT taste seeds — feeding them to Qloo
    // produces garbage cross-domain results, so we drop them. No cultural seeds => no strip.
    const culturalSeeds = resolved.filter((r) => CULTURAL_SEED_TYPES.has(r.type));
    const culturalIds = culturalSeeds.map((r) => r.id);
    const cultural: CulturalPick[] = [];
    if (culturalIds.length) {
      const domains: { key: string; type: EntityTypeUrn }[] = [
        { key: "film", type: EntityType.movie },
        { key: "tv", type: EntityType.tvShow },
        { key: "music", type: EntityType.artist },
        { key: "book", type: EntityType.book },
      ];
      // Strip trailing "(series, #1)"-style suffixes so titles read cleanly and image lookups hit.
      const cleanTitle = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
      await Promise.all(
        domains.map(async (d) => {
          try {
            // popularityMin biases to NOTABLE, recognizable titles (avoids obscure off-key picks).
            const ents = await tasteExpand(culturalIds, d.type, { take: 3, popularityMin: 0.6 });
            for (const e of ents.slice(0, 3)) if (e.name) cultural.push({ name: cleanTitle(e.name), domain: d.key });
          } catch {
            /* skip this domain */
          }
        }),
      );
    }

    // (b) Qloo's own taste-matched venues in the destination — used to rank verified places.
    // Places benefit from ALL seeds (food/vibe included), so use the full seed set here.
    let qlooPlaces: string[] = [];
    if (a.city) {
      try {
        const ents = await tasteExpand(allIds, EntityType.place, { locationQuery: a.city, take: 15 });
        qlooPlaces = ents.map((e) => e.name).filter((n): n is string => !!n);
      } catch {
        /* skip venue ranking */
      }
    }
    return { cultural, qloo_places: qlooPlaces, cultural_seeds: culturalSeeds.map((r) => r.name) };
  }
  if (name === "cultural_scene") {
    const a = args as { city?: string; month?: number | null; interests?: string[] };
    const domains = tasteDomains({ text: (a.interests ?? []).join(" ") });
    const scene = culturalScene({
      city: a.city,
      region: inferRegion(a.city),
      month: a.month ?? undefined,
      domains,
    });
    return {
      city: a.city,
      scene: scene.map((h) => ({
        kind: h.kind,
        name: h.name,
        when: h.when,
        blurb: h.blurb,
        in_season: h.inSeason,
        matches_taste: h.matchesTaste,
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
- COVERAGE HONESTY (critical): if they ask for a specific REGION or area (e.g. "Northeast", "South
  India", "Ladakh") and the destination you actually end up planning is NOT in that region — because
  your Qloo picks and our data don't really cover it — DO NOT silently plan a different region as if it
  were what they asked (that reads as the app ignoring them). Instead, OPEN the narrative with one
  honest sentence, e.g.: "We don't have deep, on-the-ground coverage for <their region> yet — but
  based on what you love, <chosen destination> is a strong match, so here's a plan for it." Then plan
  the chosen destination normally. Never pretend the substitute lies in their requested region.

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
3. Qloo cross-domain graph: call qloo_taste_graph ONCE with city=<destination>. For its seeds, pass the
   user's GENUINE cultural tastes (specific artists/films/shows/books/brands they named) PLUS their
   food/place seeds. If the user named no cultural tastes at all, that's fine — pass what you have; the
   cultural strip will simply be omitted (do NOT invent tastes to fill it). The app renders the cultural
   picks as a "cultural vibe" strip and uses qloo_places to rank verified places — you need NOT list
   them in prose. This makes Qloo visibly central.
3b. CULTURAL SCENE: call cultural_scene ONCE with city=<destination>. Pass month=<1–12> if the user
   implied WHEN they're travelling (e.g. "in December" → 12, "winter" → 12) and interests=<their
   cultural interests>. It returns real festivals/seasons & cultural venues there. If any item comes
   back in_season (the trip overlaps it), WEAVE IT INTO THE PLAN honestly on the right day (e.g. "Since
   you're there in December, catch the Margazhi concerts at the Music Academy"). The app also shows
   these as a panel, so you need only reference the timely ones. NEVER claim an event not returned here.
4. Day-by-day narrative, WEIGHTED TO THE DESTINATION:
   - The days happen IN the destination. If it's a trip from a home city, the home city is only the
     start/end (one stop or meal at most) — NEVER 1–2 full days of the home city.
   - For a big destination (e.g. Jaipur), spread the real sights/food across the days there.
   - Name the actual places from the tools. Only mark verified what get_verified_places returned.
   - TAILOR to any trip details the user gives: length → number of days; budget → prefer places whose
     price level matches; travelers (solo/couple/friends/family) → the vibe; pace → how many stops/day.
   - When a verified place includes a best_time or price (price_level / average_cost_inr), weave it in
     naturally ("best in the evening", "around ₹300 a head").

BE ECONOMICAL: 4–6 tool calls total (include qloo_taste_graph once and cultural_scene once), then STOP
and write the narrative.
STRICT HONESTY: use ONLY facts the tools returned; never invent places or claims. Any festival or event
you mention MUST have come back from cultural_scene (ideally one flagged in_season).
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

AFTER the last day, add ONE final line:
"**Estimated budget:** ₹<low>–<high> per person" — a realistic per-person estimate for the WHOLE trip
(stay + food + local travel + entries) based on the number of days, the budget tier they chose, and any
place prices the tools returned. Keep it a sensible range, not a breakdown.

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
        { temperature: 0.6, maxTokens: 700, freeOnly: true }, // light task → free tiers, not OpenAI
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
  const msg = await chat([{ role: "system", content: sys }, { role: "user", content: user }], undefined, { temperature: 0.5, maxTokens: 1600, freeOnly: true });
  if (process.env.NODE_ENV !== "production") console.log(`[refine] done in ${Date.now() - t0}ms`);
  return (msg.content ?? "").trim() || currentItinerary;
}

export type AgentResult = {
  itinerary: string;
  trace: string[];
  destinations: Destination[];
  verifiedPlaces: VerifiedPlace[];
  culturalVibe: CulturalPick[];
  /** The cultural tastes that drove the cultural vibe strip (for explainability). */
  culturalSeeds: string[];
  /** Living cultural scene (events + venues) for the destination — festival/event-aware. */
  culturalScene: CulturalHighlight[];
  /** A cross-region cultural trail that fits the taste/destination (the breadth-of-India story). */
  culturalTrail?: CulturalTrail | null;
  /** The city the plan is actually for (used for the cultural-scene panel heading). */
  destinationCity?: string | null;
};

// Map a Qloo entity's type URNs to a cultural-strip domain (so we can classify free-text seeds
// without the LLM). Non-cultural types (place/destination/locality…) return "".
function domainFromTypes(types?: string[]): string {
  const t = (types ?? []).join(" ");
  if (t.includes("urn:entity:artist")) return "music";
  if (t.includes("urn:entity:movie")) return "film";
  if (t.includes("urn:entity:tv_show")) return "tv";
  if (t.includes("urn:entity:book")) return "book";
  return "";
}

const TITLE = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Is this real itinerary prose, not an empty string or a leaked tool-call JSON? gpt-oss sometimes
// emits a tool call as plain text content (no tool_calls array); we must never surface that.
function isProse(text?: string | null): boolean {
  const t = (text ?? "").trim();
  if (t.length < 20) return false;
  if (/^[{[]/.test(t)) return false;
  if (/"(tool|parameters|target_domain|function|arguments)"\s*:/.test(t)) return false;
  return /[a-zA-Z]{4,}/.test(t);
}

// Does a Qloo match actually correspond to the phrase the user typed? Guards against fuzzy
// matches turning request text ("hey create the itinerary for me") into a bogus taste seed.
function strongMatch(phrase: string, entityName?: string): boolean {
  if (!entityName) return false;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(phrase), b = norm(entityName);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(" ")), tb = new Set(b.split(" "));
  let inter = 0;
  for (const t of tb) if (ta.has(t)) inter++;
  return inter / Math.max(1, Math.min(ta.size, tb.size)) >= 0.5;
}

// Theme → preferred destination cities. Lets the offline planner honor ACTIVITY intent (a hiking
// trip shouldn't resolve to Delhi monuments) by biasing toward depth cities that fit the theme.
// Order matters: specific sub-regions are matched BEFORE the generic catch-alls, so "Kashmir trek"
// resolves to Srinagar (not a generic Himalaya default). Each list is the PREFERENCE order of depth
// cities for that intent; the resolver prefers whichever one Qloo actually surfaced for the query.
const THEMES: { re: RegExp; cities: string[] }[] = [
  // --- Himalaya sub-regions (precise) ---
  { re: /\b(kashmir|srinagar|gulmarg|pahalgam|sonmarg|dal lake)\b/i, cities: ["srinagar"] },
  { re: /\b(ladakh|leh|pangong|nubra|zanskar)\b/i, cities: ["leh"] },
  { re: /\b(himachal|manali|kasol|spiti|kullu|shimla|dharamshala|mcleodganj|parvati|kheerganga)\b/i, cities: ["manali", "shimla"] },
  { re: /\b(uttarakhand|rishikesh|nainital|mussoorie|haridwar|dehradun|garhwal|kumaon|auli|kedarnath)\b/i, cities: ["rishikesh", "nainital", "mussoorie", "haridwar"] },
  { re: /\b(north[- ]?east|sikkim|gangtok|meghalaya|shillong|darjeeling|assam|guwahati|arunachal|tawang|nagaland|kohima)\b/i, cities: ["sikkim", "meghalaya", "darjeeling", "guwahati"] },
  // --- Generic Himalaya / trek / mountain -> NORTHERN cities only (NOT the north-east) ---
  { re: /\b(hik\w*|trek\w*|mountain\w*|climb\w*|adventur\w*|himalaya\w*|snow|ski|alpine|valley|camp\w*)\b/i,
    cities: ["manali", "srinagar", "leh", "shimla", "rishikesh", "nainital", "mussoorie"] },
  // --- Other themes ---
  { re: /\b(beach\w*|coast\w*|sea|island|backwater\w*)\b/i, cities: ["goa", "kerala", "kochi", "gokarna", "pondicherry"] },
  { re: /\b(temple\w*|heritage|histor\w*|ancient|fort|palace|sculpt\w*|architect\w*)\b/i,
    cities: ["khajuraho", "madurai", "bhubaneswar", "hampi", "udaipur", "jaipur", "varanasi", "thanjavur", "konark"] },
  { re: /\b(wildlife|safari|tiger|jungle|national park|bird\w*)\b/i, cities: ["panna", "khajuraho", "meghalaya"] },
];

/** Pick the best depth city for a matched theme: prefer one Qloo actually surfaced for THIS query
 *  (taste-driven, varies by prompt), else the theme's top available depth city. */
function themeCity(lower: string, depth: string[], qlooDests: string[]): string | undefined {
  const theme = THEMES.find((t) => t.re.test(lower));
  if (!theme) return undefined;
  const inDepth = theme.cities.filter((c) => depth.includes(c));
  const qlooLower = qlooDests.map((d) => d.toLowerCase());
  return inDepth.find((c) => qlooLower.some((q) => q.includes(c))) ?? inDepth[0];
}

/**
 * Deterministic, NO-LLM plan. When every LLM provider is rate-limited, we still assemble a full
 * plan from Qloo + the creator-evidence graph + the cultural dataset, with a templated itinerary.
 * The app always renders every feature (verified places + proof, map, cultural scene) even with
 * the planner offline — and it degrades gracefully if individual Qloo calls fail.
 */
export async function deterministicPlan(userInput: string): Promise<AgentResult> {
  const trace: string[] = ["⚠︎ Planner offline (LLM rate-limited) — assembled a verified plan from Qloo + creator data, no AI prose."];
  const depth = citiesWithDepth();
  const lower = userInput.toLowerCase();
  const region = inferRegion(userInput);
  const month = inferMonth(userInput);
  // Strip the appended "My answers:" Q&A block and any parenthetical instructions so taste seeds
  // come from the user's ACTUAL tastes, not prompt scaffolding (which produced garbage before).
  const cleanInput = userInput.split(/\n\n|my answers:/i)[0].replace(/\([^)]*\)/g, " ").trim();
  const matchDepth = (name: string) => {
    const n = name.toLowerCase();
    return depth.find((d) => n === d || n.includes(d) || d.includes(n));
  };

  // 1. Resolve taste seeds on Qloo (read entity types to classify cultural ones) + taste-matched
  //    destinations + cross-domain vibe. All best-effort — a Qloo hiccup never breaks the plan.
  const destinations: Destination[] = [];
  const culturalVibe: CulturalPick[] = [];
  let culturalSeeds: string[] = [];
  let allIds: string[] = [];
  try {
    // Strip filler/logistics words so "I love Coldplay" → "Coldplay" (not a fuzzy book match) and
    // "plan a trip to Jaipur" → "Jaipur" (a place, not a bogus cultural seed).
    const strip = (s: string) =>
      s.replace(/^(hey|hi|so|please|ok|okay)\b[,\s]*/i, "")
        .replace(/^(me and my friends?|my friends? and i|i|we)\s+((really|also|just|quite)\s+)?(love|like|enjoy|adore|prefer|am into|are into|want|wanna|would like|like to|are)\s+/i, "")
        .replace(/\b(plan(ning)?|book(ing)?|create|make|want|itinerary|itenary|trip|tour|holiday|vacation|getaway|travel(ling|ing)?|visit(ing)?|going|for me|adventurous|adventure)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const seeds: Seed[] = cleanInput
      .split(/[,;/\n]|\band\b|\bwith\b|\bto\b/i)
      .map((s) => strip(s))
      .filter((s) => s.length > 2 && s.length < 40)
      .slice(0, 6)
      .map((name) => ({ name, type: "" }));
    const resolvedAll: { id: string; name: string; domain: string; strong: boolean }[] = [];
    for (const s of seeds) {
      try {
        const found = await searchEntities(s.name, undefined, 1);
        const id = found[0] && entityId(found[0]);
        if (id) resolvedAll.push({
          id,
          name: found[0].name || s.name,            // use Qloo's real entity name as the label
          domain: domainFromTypes(found[0].types),
          strong: strongMatch(s.name, found[0].name), // did it really match what the user typed?
        });
      } catch { /* skip this seed */ }
    }
    allIds = resolvedAll.map((r) => r.id);
    // Cultural vibe + graph use ONLY strongly-matched cultural seeds, so request text never
    // becomes a bogus "taste". Destinations can still use the looser full set.
    const culturalResolved = resolvedAll.filter((r) => r.domain && r.strong);
    culturalSeeds = culturalResolved.map((r) => r.name);

    if (allIds.length) {
      try {
        const ents = await tasteExpand(allIds, EntityType.destination, { countryCode: "IN", take: 8 });
        for (const e of ents.slice(0, 8)) {
          if (!e.name) continue;
          destinations.push({
            name: e.name,
            city: e.properties?.geocode?.city ?? e.properties?.geocode?.name ?? null,
            affinity: typeof e.query?.affinity === "number" ? e.query.affinity : undefined,
            why: culturalSeeds.length ? `Qloo links this to ${culturalSeeds.slice(0, 2).join(" & ")}` : "Qloo taste match",
          });
        }
        trace.push(`Qloo returned ${destinations.length} taste-matched destinations.`);
      } catch { /* skip destinations */ }

      const culturalIds = culturalResolved.map((r) => r.id);
      if (culturalIds.length) {
        const domains: { key: string; type: EntityTypeUrn }[] = [
          { key: "film", type: EntityType.movie },
          { key: "tv", type: EntityType.tvShow },
          { key: "music", type: EntityType.artist },
          { key: "book", type: EntityType.book },
        ];
        const clean = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
        await Promise.all(domains.map(async (d) => {
          try {
            const ents = await tasteExpand(culturalIds, d.type, { take: 3, popularityMin: 0.6 });
            for (const e of ents.slice(0, 3)) if (e.name) culturalVibe.push({ name: clean(e.name), domain: d.key });
          } catch { /* skip domain */ }
        }));
        if (culturalVibe.length) trace.push(`Built a cross-domain cultural vibe from ${culturalSeeds.join(", ")}.`);
      }
    }
  } catch { /* whole Qloo stage is best-effort */ }

  // 2. Pick ONE destination to plan — prefer a city we have creator-verified DEPTH for, so the
  //    plan is coherent: a depth city named in the request > the first Qloo destination we have
  //    depth for > nothing (then we're honest that we lack verified depth and lean on Qloo).
  let destinationCity: string | null = null;
  const named = depth.find((c) => lower.includes(c));
  if (named) {
    destinationCity = TITLE(named);
  } else {
    // Honor activity/sub-region intent: prefer the depth city Qloo surfaced for this query (a Kashmir
    // trek picks Srinagar; a generic Himalaya trip picks a NORTHERN city, never the north-east).
    const tCity = themeCity(lower, depth, destinations.map((d) => d.name));
    if (tCity) {
      destinationCity = TITLE(tCity);
      trace.push(`Read your activity/theme and matched ${destinationCity} — a fitting creator-verified city.`);
    } else {
      for (const d of destinations) {
        const m = matchDepth(d.name);
        if (m) { destinationCity = TITLE(m); break; }
      }
    }
  }
  if (destinationCity) trace.push(`Focused on ${destinationCity} — a creator-verified depth city.`);

  // 3. Verified places for THAT city only (keeps the list, map pins and heading consistent).
  //    Empty when we have no depth there — which we state honestly rather than showing other cities.
  const verifiedPlaces = destinationCity
    ? listVerifiedPlaces({ city: destinationCity, interests: [cleanInput], limit: 8 })
    : [];
  if (destinationCity) {
    trace.push(`Pulled ${verifiedPlaces.length} creator-verified places in ${destinationCity}.`);
    if (allIds.length) {
      try {
        const ents = await tasteExpand(allIds, EntityType.place, { locationQuery: destinationCity, take: 15 });
        const names = ents.map((e) => e.name).filter((n): n is string => !!n);
        for (const p of verifiedPlaces) if (qlooCorroborates(p.name, names)) p.qloo_ranked = true;
        verifiedPlaces.sort((a, b) => Number(b.qloo_ranked ?? false) - Number(a.qloo_ranked ?? false));
      } catch { /* skip ranking */ }
    }
  }

  // 4. Cultural scene for the chosen city / region (festival/event-aware).
  const culturalScene_ = culturalScene({
    city: destinationCity,
    region,
    month,
    domains: tasteDomains({ text: cleanInput }),
  });
  if (culturalScene_.length) trace.push(`Matched ${culturalScene_.length} cultural highlights for the season & taste.`);

  // 5. Templated itinerary (no prose). Heading = the depth city, else the top Qloo destination.
  const topDest = destinations.find((d) => !destinationCity || d.name.toLowerCase() !== destinationCity.toLowerCase());
  const where = destinationCity ?? topDest?.name ?? (region ? `${region} India` : "India");
  const lines: string[] = [];
  lines.push(`# Your taste trip to ${where}`);
  lines.push(`*Our AI writer is rate-limited right now, so this is a verified plan straight from Qloo + creator data. Hit **Update plan** in a minute for a narrated version.*`);
  if (!destinationCity) {
    lines.push(`> We don't have creator-verified depth for **${where}** yet — so here are Qloo's taste-matched destinations and the cultural scene instead of hand-verified spots.`);
  }
  if (verifiedPlaces.length) {
    lines.push(`## Creator-verified spots in ${destinationCity}`);
    for (const p of verifiedPlaces.slice(0, 8)) {
      const bits = [p.specialities?.slice(0, 3).join(", ")].filter(Boolean).join(" ");
      lines.push(`- **${p.name}**${bits ? ` — ${bits}` : ""}${p.qloo_ranked ? " ✨ *Qloo pick*" : ""} _(✓ ${p.sources} source${p.sources === 1 ? "" : "s"})_`);
    }
  }
  if (culturalScene_.length) {
    lines.push(`## Cultural scene`);
    for (const h of culturalScene_.slice(0, 6)) {
      lines.push(`- **${h.name}**${h.when ? ` (${h.when})` : ""}${h.inSeason ? " 🔥 *in season*" : ""} — ${h.blurb}`);
    }
  }
  const otherDests = destinations.filter((d) => !destinationCity || d.name.toLowerCase() !== destinationCity.toLowerCase());
  if (otherDests.length) {
    lines.push(`## ${destinationCity ? "Also taste-matched for you" : "Taste-matched destinations"}`);
    lines.push(otherDests.slice(0, 6).map((d) => d.name).join(" · "));
  }
  lines.push(`\n_Estimated budget: ₹3,000–8,000 per person per day depending on stays & travel._`);

  const culturalTrail = pickTrail({ domains: tasteDomains({ text: cleanInput }), city: destinationCity, region });
  if (culturalTrail) trace.push(`Suggested the "${culturalTrail.title}" cross-region trail.`);

  return {
    itinerary: lines.join("\n\n"),
    trace,
    destinations,
    verifiedPlaces,
    culturalVibe,
    culturalSeeds,
    culturalScene: culturalScene_,
    culturalTrail,
    destinationCity,
  };
}

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
  let culturalSeeds: string[] = []; // cultural tastes that drove the strip (explainability)
  let culturalSceneOut: CulturalHighlight[] = []; // living cultural scene for the destination
  let culturalTrailOut: CulturalTrail | null = null; // cross-region trail fitting the taste/destination
  let destinationCity: string | null = null; // the city the plan is actually for
  const seedTypesUsed = new Set<string>(); // cultural seed TYPES the agent fed Qloo (for taste domains)
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
  // Guarantee a cultural scene even if the model never called the tool: derive it from the
  // destination city (or a requested region) the agent focused on, the trip's timing and taste.
  const finalizeScene = () => {
    const region = inferRegion(userInput);
    const domains = tasteDomains({ seedTypes: [...seedTypesUsed], text: userInput });
    if (!culturalSceneOut.length && (destinationCity || region)) {
      culturalSceneOut = culturalScene({ city: destinationCity, region, month: inferMonth(userInput), domains });
    }
    culturalTrailOut = pickTrail({ domains, city: destinationCity, region });
  };
  // If the model offered destinations but never committed to a city (common for vague-destination
  // prompts like "Himalayas please"), resolve one ourselves from a depth city named in the request,
  // the activity THEME, or a Qloo destination we actually have depth for — then pull its verified
  // places. Guarantees a full plan (places + map + local pack) instead of only destination cards.
  const ensureDepthCity = () => {
    if (destinationCity || verifiedPlaces.length) return;
    const depth = citiesWithDepth();
    const lower = userInput.toLowerCase();
    // (a) a depth city named in the request wins outright.
    let city = depth.find((c) => lower.includes(c));
    // (b) activity/sub-region theme → the depth city Qloo surfaced for this query (else theme default).
    if (!city) city = themeCity(lower, depth, destinations.map((d) => d.name));
    // (c) any Qloo destination we have depth for.
    if (!city) {
      for (const d of destinations) {
        const n = d.name.toLowerCase();
        const m = depth.find((c) => n === c || n.includes(c) || c.includes(n));
        if (m) { city = m; break; }
      }
    }
    if (!city) return;
    destinationCity = TITLE(city);
    for (const p of listVerifiedPlaces({ city, interests: [userInput], limit: 8 })) addPlace(p);
    trace.push(`Focused on ${destinationCity} — a creator-verified depth city that fits your trip.`);
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

        // Note any cultural seed TYPES the agent fed Qloo (for taste-domain matching) and the
        // destination city it's focusing on (for the cultural-scene panel + fallback).
        for (const s of (parsed.seeds as Seed[] | undefined) ?? [])
          if (s?.type && CULTURAL_SEED_TYPES.has(s.type.toLowerCase())) seedTypesUsed.add(s.type.toLowerCase());
        if (typeof parsed.city === "string" && parsed.city.trim()) destinationCity = parsed.city.trim();

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
          const r = result as { cultural?: CulturalPick[]; qloo_places?: string[]; cultural_seeds?: string[] };
          for (const c of r.cultural ?? []) addCultural(c);
          for (const n of r.qloo_places ?? []) qlooPlaceNames.push(n);
          if (r.cultural_seeds?.length) culturalSeeds = r.cultural_seeds;
        } else if (tc.function.name === "cultural_scene") {
          // Recompute the full scene (with maps_url etc.) deterministically from the city the
          // model passed — richer than the trimmed tool payload and keyed to the trip's timing/taste.
          const city = typeof parsed.city === "string" ? parsed.city : destinationCity;
          const month = typeof parsed.month === "number" ? parsed.month : inferMonth(userInput);
          const domains = tasteDomains({
            seedTypes: [...seedTypesUsed],
            text: `${userInput} ${(parsed.interests as string[] | undefined)?.join(" ") ?? ""}`,
          });
          if (city) culturalSceneOut = culturalScene({ city, region: inferRegion(userInput), month, domains });
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
    // Only surface this as the plan if it's real prose; a leaked tool-call JSON → compose instead.
    if (isProse(msg.content)) {
      ensureDepthCity();
      applyQlooRanking();
      finalizeScene();
      return { itinerary: msg.content!.trim(), trace, destinations, verifiedPlaces, culturalVibe, culturalSeeds, culturalScene: culturalSceneOut, culturalTrail: culturalTrailOut, destinationCity };
    }
    break; // fall through to compose-from-data (fresh context)
  }
  ensureDepthCity();
  applyQlooRanking();
  finalizeScene();
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
    // If even the compose step won't produce prose (gpt-oss misbehaving), fall back to the
    // deterministic plan so the user never sees raw JSON or an empty itinerary.
    if (!isProse(composed.content)) return deterministicPlan(userInput);
    return {
      itinerary: composed.content!.trim(),
      trace,
      destinations,
      verifiedPlaces,
      culturalVibe,
      culturalSeeds,
      culturalScene: culturalSceneOut,
      culturalTrail: culturalTrailOut,
      destinationCity,
    };
  } catch {
    return deterministicPlan(userInput);
  }
}
