// Cultural Scene — the "what's the living culture here" layer.
// A curated, verifiable dataset of India's signature cultural EVENTS (festivals, music/film/
// dance/literature seasons) and VENUES (museums, theatres, art spaces, music halls), keyed by
// city/region. Given a destination + trip timing + the user's taste, we surface what to catch
// while they're there — flagged "in season" when the dates overlap and "matches your taste"
// when it fits their cultural domains. Deterministic; needs no LLM. Server-safe (pure data).

import { mapsUrl } from "./evidence";

/** Cultural domains a highlight serves — aligned to Qloo's cross-domain taste axes. */
export type CultureDomain =
  | "music" | "dance" | "film" | "art" | "theatre" | "literature" | "crafts" | "heritage" | "festival";

export type CultureKind = "event" | "venue";

export type CulturalHighlight = {
  kind: CultureKind;
  name: string;
  city: string;
  region: Region;
  domains: CultureDomain[];
  blurb: string;
  /** For events: the months (1–12) the event typically falls in. */
  months?: number[];
  /** Human-readable timing label for events, e.g. "Early December". */
  when?: string;
  maps_url: string;
  // --- computed per query ---
  /** The event's season overlaps the trip's month. */
  inSeason?: boolean;
  /** This highlight fits one of the user's cultural taste domains. */
  matchesTaste?: boolean;
};

type Region = "Northeast" | "North" | "South" | "West" | "East" | "Central" | "pan-India";

// A raw row without the derived maps_url (added in buildHighlights).
type Row = Omit<CulturalHighlight, "maps_url" | "inSeason" | "matchesTaste">;

// ── EVENTS ───────────────────────────────────────────────────────────────────
// Real, well-known cultural events across every region of India (breadth + cultural depth).
const EVENTS: Row[] = [
  // Northeast
  { kind: "event", name: "Hornbill Festival", city: "Kohima", region: "Northeast", domains: ["festival", "dance", "music", "crafts"], months: [12], when: "1–10 December", blurb: "Nagaland's 'festival of festivals' — all 16 tribes, war dances, folk music and crafts at Kisama." },
  { kind: "event", name: "Ziro Music Festival", city: "Ziro", region: "Northeast", domains: ["music"], months: [9], when: "Late September", blurb: "Outdoor indie & folk festival in Arunachal's rice-terraced Ziro valley." },
  { kind: "event", name: "Bihu", city: "Guwahati", region: "Northeast", domains: ["dance", "festival", "music"], months: [4], when: "Mid-April", blurb: "Assam's spring harvest festival — Bihu dance, folk songs and feasts." },
  // North
  { kind: "event", name: "Jaipur Literature Festival", city: "Jaipur", region: "North", domains: ["literature"], months: [1], when: "Late January", blurb: "The world's largest free lit fest — authors, debates and ideas at Diggi Palace." },
  { kind: "event", name: "Pushkar Camel Fair", city: "Pushkar", region: "North", domains: ["festival", "crafts", "music"], months: [11], when: "November", blurb: "Desert fair of livestock, folk performers and Rajasthani crafts around the holy lake." },
  { kind: "event", name: "Jaisalmer Desert Festival", city: "Jaisalmer", region: "North", domains: ["music", "dance", "crafts"], months: [2], when: "February", blurb: "Folk music, Kalbeliya dance and camel processions in the Thar dunes." },
  { kind: "event", name: "Jodhpur RIFF", city: "Jodhpur", region: "North", domains: ["music"], months: [10], when: "October", blurb: "Rajasthan International Folk Festival — roots music under the Mehrangarh Fort." },
  { kind: "event", name: "Udaipur World Music Festival", city: "Udaipur", region: "North", domains: ["music"], months: [2], when: "February", blurb: "Global and Indian acts across lakeside stages in the City of Lakes." },
  { kind: "event", name: "Surajkund Crafts Mela", city: "Faridabad", region: "North", domains: ["crafts", "dance"], months: [2], when: "February", blurb: "Huge handicrafts fair near Delhi with a rotating partner state's folk arts." },
  { kind: "event", name: "Taj Mahotsav", city: "Agra", region: "North", domains: ["crafts", "music", "dance"], months: [2], when: "18–27 February", blurb: "Ten-day arts, crafts and cuisine carnival beside the Taj." },
  { kind: "event", name: "Holi (Braj)", city: "Mathura", region: "North", domains: ["festival"], months: [3], when: "March", blurb: "The most storied Holi — Lathmar and flower Holi across Mathura–Vrindavan." },
  { kind: "event", name: "Dev Deepawali", city: "Varanasi", region: "North", domains: ["festival"], months: [11], when: "November", blurb: "Lakhs of lamps light every ghat of the Ganga, 15 days after Diwali." },
  // West
  { kind: "event", name: "Rann Utsav", city: "Kutch", region: "West", domains: ["crafts", "music", "dance", "festival"], months: [11, 12, 1, 2], when: "November–February", blurb: "Tent-city festival on Gujarat's white salt desert — folk arts and Kutchi crafts." },
  { kind: "event", name: "Navratri Garba", city: "Ahmedabad", region: "West", domains: ["dance", "festival", "music"], months: [9, 10], when: "September–October", blurb: "Nine nights of Garba and Dandiya — Gujarat's whirling dance festival." },
  { kind: "event", name: "Ganesh Chaturthi", city: "Mumbai", region: "West", domains: ["festival"], months: [8, 9], when: "August–September", blurb: "Mumbai's biggest festival — grand pandals and the immersion processions." },
  { kind: "event", name: "Sunburn", city: "Goa", region: "West", domains: ["music"], months: [12], when: "Late December", blurb: "Asia's largest EDM festival on the Goa coast over New Year week." },
  { kind: "event", name: "IFFI Goa", city: "Panaji", region: "West", domains: ["film"], months: [11], when: "20–28 November", blurb: "International Film Festival of India — world cinema and premieres in Panaji." },
  { kind: "event", name: "Goa Carnival", city: "Panaji", region: "West", domains: ["festival", "music", "dance"], months: [2, 3], when: "February–March", blurb: "Portuguese-rooted street carnival — floats, King Momo and live bands." },
  { kind: "event", name: "SulaFest", city: "Nashik", region: "West", domains: ["music"], months: [2], when: "February", blurb: "Vineyard music & wine festival at Sula, Nashik." },
  { kind: "event", name: "Sawai Gandharva", city: "Pune", region: "West", domains: ["music"], months: [12], when: "December", blurb: "Landmark Hindustani classical music festival honouring the maestro." },
  { kind: "event", name: "Khajuraho Dance Festival", city: "Khajuraho", region: "Central", domains: ["dance"], months: [2], when: "February", blurb: "Classical dance against the floodlit Khajuraho temples." },
  // South
  { kind: "event", name: "Margazhi Music Season", city: "Chennai", region: "South", domains: ["music", "dance"], months: [12, 1], when: "Mid-Dec–mid-Jan", blurb: "The world's largest Carnatic music & Bharatanatyam season across Chennai's sabhas." },
  { kind: "event", name: "Kochi-Muziris Biennale", city: "Kochi", region: "South", domains: ["art"], months: [12, 1, 2, 3, 4], when: "December–April", blurb: "India's biggest contemporary art biennale across Fort Kochi's warehouses." },
  { kind: "event", name: "Hampi Utsav", city: "Hampi", region: "South", domains: ["dance", "music", "heritage"], months: [11, 1], when: "November / January", blurb: "Dance, music and light shows amid the Vijayanagara ruins." },
  { kind: "event", name: "Mysuru Dasara", city: "Mysuru", region: "South", domains: ["festival", "heritage", "music"], months: [9, 10], when: "September–October", blurb: "Royal ten-day Dasara — the lit palace and the Jamboo Savari procession." },
  { kind: "event", name: "Onam", city: "Kochi", region: "South", domains: ["festival", "dance"], months: [8, 9], when: "August–September", blurb: "Kerala's harvest festival — Pookalam, Vallamkali boat races and Kathakali." },
  { kind: "event", name: "Thrissur Pooram", city: "Thrissur", region: "South", domains: ["festival", "music"], months: [4, 5], when: "April–May", blurb: "Kerala's spectacular temple festival — caparisoned elephants and panchavadyam." },
  { kind: "event", name: "Pongal", city: "Madurai", region: "South", domains: ["festival"], months: [1], when: "Mid-January", blurb: "Tamil harvest festival — Jallikattu, kolam and the first rice of the season." },
  // East
  { kind: "event", name: "Durga Puja", city: "Kolkata", region: "East", domains: ["festival", "art"], months: [9, 10], when: "September–October", blurb: "UNESCO-listed — Kolkata becomes an open-air gallery of themed pandals." },
  { kind: "event", name: "Kolkata International Film Festival", city: "Kolkata", region: "East", domains: ["film"], months: [11, 12], when: "November", blurb: "KIFF — a century-old cinema city's marquee film festival." },
  { kind: "event", name: "Konark Dance Festival", city: "Konark", region: "East", domains: ["dance"], months: [12, 2], when: "December / February", blurb: "Classical Indian dance before the Sun Temple's open-air stage." },
  { kind: "event", name: "Rath Yatra", city: "Puri", region: "East", domains: ["festival"], months: [6, 7], when: "June–July", blurb: "Puri's giant chariot procession of Lord Jagannath." },
];

// ── VENUES ───────────────────────────────────────────────────────────────────
// Signature cultural spaces — museums, theatres, music halls, galleries, dance institutions.
const VENUES: Row[] = [
  // Delhi
  { kind: "venue", name: "National Museum", city: "Delhi", region: "North", domains: ["heritage", "art"], blurb: "India's premier museum — 5,000 years from Harappa to Mughal miniatures." },
  { kind: "venue", name: "National Gallery of Modern Art", city: "Delhi", region: "North", domains: ["art"], blurb: "Flagship modern & contemporary Indian art in a Jaipur House setting." },
  { kind: "venue", name: "Kamani Auditorium", city: "Delhi", region: "North", domains: ["music", "dance", "theatre"], blurb: "Delhi's hub for classical dance recitals and concerts." },
  { kind: "venue", name: "India Habitat Centre", city: "Delhi", region: "North", domains: ["art", "theatre", "music"], blurb: "Galleries, film screenings and performances under one roof." },
  { kind: "venue", name: "National Crafts Museum", city: "Delhi", region: "North", domains: ["crafts"], blurb: "Living crafts village with artisans and folk & tribal collections." },
  // Mumbai
  { kind: "venue", name: "Prithvi Theatre", city: "Mumbai", region: "West", domains: ["theatre"], blurb: "Juhu's intimate, legendary home of Indian theatre and its café." },
  { kind: "venue", name: "NCPA", city: "Mumbai", region: "West", domains: ["music", "theatre", "dance"], blurb: "National Centre for the Performing Arts — India's premier concert complex." },
  { kind: "venue", name: "Jehangir Art Gallery", city: "Mumbai", region: "West", domains: ["art"], blurb: "Kala Ghoda's storied gallery for contemporary Indian artists." },
  { kind: "venue", name: "CSMVS Museum", city: "Mumbai", region: "West", domains: ["heritage", "art"], blurb: "Grand Indo-Saracenic museum of art, archaeology and natural history." },
  // South
  { kind: "venue", name: "The Music Academy", city: "Chennai", region: "South", domains: ["music"], blurb: "The epicentre of Carnatic music and the Margazhi season." },
  { kind: "venue", name: "Kalakshetra Foundation", city: "Chennai", region: "South", domains: ["dance", "music"], blurb: "Rukmini Devi's temple of Bharatanatyam and Carnatic learning." },
  { kind: "venue", name: "Salar Jung Museum", city: "Hyderabad", region: "South", domains: ["heritage", "art"], blurb: "One person's vast collection — Veiled Rebecca, clocks and manuscripts." },
  { kind: "venue", name: "Kerala Kalamandalam", city: "Thrissur", region: "South", domains: ["dance", "theatre"], blurb: "Kerala's deemed university for Kathakali, Mohiniyattam and Koodiyattam." },
  { kind: "venue", name: "Ranga Shankara", city: "Bengaluru", region: "South", domains: ["theatre"], blurb: "Bengaluru's beloved theatre staging a play (nearly) every day." },
  { kind: "venue", name: "Chowdiah Memorial Hall", city: "Bengaluru", region: "South", domains: ["music"], blurb: "Violin-shaped auditorium hosting classical and contemporary concerts." },
  // East
  { kind: "venue", name: "Victoria Memorial", city: "Kolkata", region: "East", domains: ["heritage", "art"], blurb: "Marble landmark and museum of the Raj and Bengal's art." },
  { kind: "venue", name: "Indian Museum", city: "Kolkata", region: "East", domains: ["heritage"], blurb: "India's oldest and largest museum (1814) — antiquities to fossils." },
  { kind: "venue", name: "Rabindra Sadan", city: "Kolkata", region: "East", domains: ["theatre", "music"], blurb: "Kolkata's cultural flagship for theatre, music and film." },
  // North / Central
  { kind: "venue", name: "Albert Hall Museum", city: "Jaipur", region: "North", domains: ["heritage", "art"], blurb: "Jaipur's oldest museum — Indo-Saracenic, lit golden at night." },
  { kind: "venue", name: "Jawahar Kala Kendra", city: "Jaipur", region: "North", domains: ["art", "theatre", "crafts"], blurb: "Charles Correa's arts centre — galleries, theatre and a museum." },
  { kind: "venue", name: "Bharat Bhavan", city: "Bhopal", region: "Central", domains: ["art", "theatre", "music"], blurb: "Multi-arts complex for tribal & contemporary art, poetry and drama." },
];

const ALL: CulturalHighlight[] = [...EVENTS, ...VENUES].map((r) => ({
  ...r,
  maps_url: mapsUrl(r.name, r.city),
}));

// City spelling variants → canonical city used above.
const CITY_ALIASES: Record<string, string> = {
  "new delhi": "delhi", gurgaon: "delhi", gurugram: "delhi", ncr: "delhi", noida: "delhi",
  bombay: "mumbai", bengaluru: "bengaluru", bangalore: "bengaluru",
  calcutta: "kolkata", madras: "chennai", banaras: "varanasi", benares: "varanasi",
  cochin: "kochi", "fort kochi": "kochi", ernakulam: "kochi",
  allahabad: "prayagraj", mysore: "mysuru", pondicherry: "puducherry",
  kutch: "kutch", bhuj: "kutch", kohima: "kohima", nagaland: "kohima",
};

// Region request words → Region tag.
const REGION_WORDS: { re: RegExp; region: Region }[] = [
  { re: /north\s*east|north-east|\bne\b|nagaland|arunachal|assam|meghalaya|sikkim|manipur|mizoram|tripura/i, region: "Northeast" },
  { re: /south india|\bsouth\b|tamil|kerala|karnataka|telangana|andhra/i, region: "South" },
  { re: /\bwest(ern)? india\b|gujarat|maharashtra|\bgoa\b|konkan/i, region: "West" },
  { re: /\beast(ern)? india\b|bengal|odisha|orissa|bihar|jharkhand/i, region: "East" },
  { re: /central india|madhya pradesh|chhattisgarh/i, region: "Central" },
  { re: /north india|rajasthan|punjab|uttar pradesh|\buttarakhand\b|himachal|haryana/i, region: "North" },
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
// Seasons → a representative peak month (for "winter trip", "monsoon", etc.).
const SEASONS: { re: RegExp; month: number }[] = [
  { re: /\bwinter\b|\bchristmas\b|new year/i, month: 12 },
  { re: /\bsummer\b/i, month: 5 },
  { re: /\bmonsoon\b|\brains?\b/i, month: 7 },
  { re: /\bspring\b/i, month: 3 },
  { re: /\bautumn\b|\bfall\b/i, month: 10 },
];

/** Infer a target month (1–12) from free text (trip request), or undefined. */
export function inferMonth(text?: string | null): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  for (const key of Object.keys(MONTHS)) {
    // word-boundary match so "mar" doesn't hit "market"
    if (new RegExp(`\\b${key}\\b`).test(t)) return MONTHS[key];
  }
  for (const s of SEASONS) if (s.re.test(t)) return s.month;
  return undefined;
}

// Taste signal words → cultural domains (for the "matches your taste" flag).
const TASTE_WORDS: { re: RegExp; domains: CultureDomain[] }[] = [
  { re: /music|concert|gig|band|singer|song|sufi|classical|carnatic|hindustani|folk|edm|indie/i, domains: ["music"] },
  { re: /danc|bharatanatyam|kathak|garba|ballet/i, domains: ["dance"] },
  { re: /film|cinema|movie|theat(re|er)|play|drama|stage/i, domains: ["film", "theatre"] },
  { re: /art|gallery|paint|biennale|sculpt|craft|handloom|handicraft/i, domains: ["art", "crafts"] },
  { re: /book|literat|poet|author|writ/i, domains: ["literature"] },
  { re: /museum|histor|heritage|monument|fort|palace|temple|ruins|archae/i, domains: ["heritage"] },
  { re: /festival|fair|mela|carnival|celebrat/i, domains: ["festival"] },
];

/** Map the user's cultural seed TYPES + free-text interests to cultural domains. */
export function tasteDomains(opts: { seedTypes?: string[]; text?: string | null }): CultureDomain[] {
  const out = new Set<CultureDomain>();
  for (const raw of opts.seedTypes ?? []) {
    const t = (raw || "").toLowerCase();
    if (/music|artist|band|song/.test(t)) { out.add("music"); out.add("dance"); }
    else if (/film|movie/.test(t)) out.add("film");
    else if (/tv|show/.test(t)) { out.add("film"); out.add("theatre"); }
    else if (/book|author/.test(t)) out.add("literature");
    else if (/brand|fashion/.test(t)) { out.add("crafts"); out.add("art"); }
  }
  const text = opts.text ?? "";
  for (const w of TASTE_WORDS) if (w.re.test(text)) w.domains.forEach((d) => out.add(d));
  return [...out];
}

function canonCity(city?: string | null): string | undefined {
  if (!city) return undefined;
  const c = city.toLowerCase().trim();
  return CITY_ALIASES[c] ?? c;
}

/** Detect a requested region from the user's free text (e.g. "Northeast"), or undefined. */
export function inferRegion(text?: string | null): Region | undefined {
  if (!text) return undefined;
  for (const r of REGION_WORDS) if (r.re.test(text)) return r.region;
  return undefined;
}

export type SceneOpts = {
  city?: string | null;
  region?: Region | null;
  month?: number | null;
  domains?: CultureDomain[];
  limit?: number;
};

/**
 * The cultural scene for a destination: events + venues to catch there, with `inSeason`
 * (trip month overlaps the event) and `matchesTaste` (fits the user's cultural domains)
 * flagged and sorted to the top. Falls back to the region when the exact city isn't covered.
 */
export function culturalScene(opts: SceneOpts): CulturalHighlight[] {
  const city = canonCity(opts.city);
  const region = opts.region ?? undefined;
  const month = opts.month ?? undefined;
  const domains = new Set(opts.domains ?? []);

  const cityMatch = (h: CulturalHighlight) => {
    const hc = canonCity(h.city)!;
    if (!city) return false;
    return hc === city || hc.includes(city) || city.includes(hc);
  };

  let rows = ALL.filter(cityMatch);
  const matchedCity = rows.length > 0;
  // No city coverage → widen to the whole region so a NE/South request still shows something.
  if (!rows.length && region) rows = ALL.filter((h) => h.region === region);
  if (!rows.length) return [];

  const scored = rows.map((h) => {
    const inSeason = h.kind === "event" && !!month && !!h.months?.includes(month);
    const matchesTaste = domains.size > 0 && h.domains.some((d) => domains.has(d));
    return { ...h, inSeason, matchesTaste };
  });

  scored.sort((a, b) => {
    // in-season events first, then taste matches, then events over venues, then name.
    const w = (x: typeof a) => (x.inSeason ? 2 : 0) + (x.matchesTaste ? 1 : 0);
    const dw = w(b) - w(a);
    if (dw) return dw;
    if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // When we fell back to a whole region, keep it tight so it reads as a highlight, not a list.
  const cap = opts.limit ?? (matchedCity ? 8 : 5);
  return scored.slice(0, cap);
}

// ---------------------------------------------------------------------------
// Cross-region cultural trails — curated multi-city routes that string together
// places we cover by a shared cultural theme (the "breadth of India" story).
// ---------------------------------------------------------------------------

export type TrailStop = { city: string; region: Region; note: string };
export type CulturalTrail = {
  id: string;
  title: string;
  domains: CultureDomain[];
  blurb: string;
  stops: TrailStop[];
};

export const CULTURAL_TRAILS: CulturalTrail[] = [
  {
    id: "temple-art",
    title: "Temple-Art & Sculpture Trail",
    domains: ["art", "heritage", "crafts"],
    blurb: "A sweep through India's greatest temple sculpture — erotic Chandela carvings, Kalinga spires and a living Dravidian megatemple.",
    stops: [
      { city: "Khajuraho", region: "Central", note: "Chandela temple sculpture (UNESCO), Western Group & Kandariya Mahadeva" },
      { city: "Bhubaneswar", region: "East", note: "Kalinga-style temple city — Lingaraj, Mukteshwar, nearby Konark Sun Temple" },
      { city: "Madurai", region: "South", note: "Meenakshi Amman — a living Dravidian megatemple of painted gopurams" },
    ],
  },
  {
    id: "himalayan-culture",
    title: "Eastern Himalaya & Northeast Trail",
    domains: ["heritage", "crafts", "festival"],
    blurb: "Monasteries, living root bridges and tribal culture across the cloud-wrapped Northeast.",
    stops: [
      { city: "Darjeeling", region: "East", note: "Himalayan hill culture, toy train, tea heritage" },
      { city: "Sikkim", region: "Northeast", note: "Buddhist monasteries (Rumtek, Pemayangtse) & Kanchenjunga" },
      { city: "Meghalaya", region: "Northeast", note: "Khasi living-root bridges, Cherrapunji, sacred groves" },
    ],
  },
  {
    id: "classical-south",
    title: "Classical Music & Dance Trail",
    domains: ["music", "dance", "heritage"],
    blurb: "The heartlands of Carnatic music and temple dance — from megatemples to the December season.",
    stops: [
      { city: "Madurai", region: "South", note: "Temple music & Meenakshi festivals" },
      { city: "Chennai", region: "South", note: "Margazhi/December season — Carnatic sabhas & Bharatanatyam" },
      { city: "Bhubaneswar", region: "East", note: "Odissi dance heartland & temple traditions" },
    ],
  },
  {
    id: "royal-rajasthan",
    title: "Royal Rajasthan Craft Trail",
    domains: ["crafts", "heritage", "art"],
    blurb: "Palaces, miniature painting and living craft bazaars across the desert kingdoms.",
    stops: [
      { city: "Jaipur", region: "North", note: "Block-print, blue pottery, City Palace & Jantar Mantar" },
      { city: "Udaipur", region: "West", note: "Lake palaces, miniature painting, Mewar heritage" },
    ],
  },
];

/** Pick the trail that best fits the user's taste domains, destination city or region. */
export function pickTrail(opts: { domains?: CultureDomain[]; city?: string | null; region?: Region }): CulturalTrail | null {
  const city = canonCity(opts.city);
  const domains = new Set(opts.domains ?? []);
  const score = (t: CulturalTrail) => {
    let s = 0;
    if (city && t.stops.some((st) => canonCity(st.city) === city)) s += 5;
    if (opts.region && t.stops.some((st) => st.region === opts.region)) s += 2;
    for (const d of t.domains) if (domains.has(d)) s += 1;
    return s;
  };
  const ranked = [...CULTURAL_TRAILS].map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s);
  // Only surface a trail when there's a real signal (taste/city/region match), else the strongest default.
  return ranked[0]?.s ? ranked[0].t : null;
}
