"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type VerifiedPlace = {
  name: string;
  category: string | null;
  area: string | null;
  sources: number;
  specialities: string[];
  tips: string[];
  image: string | null;
};
type Destination = { name: string; city: string | null; image: string | null };
type PlanResult = {
  itinerary: string;
  trace: string[];
  destinations: Destination[];
  verifiedPlaces: VerifiedPlace[];
};

const CHIPS = [
  { icon: "♫", label: "A.R. Rahman" },
  { icon: "🎬", label: "Inception" },
  { icon: "🍜", label: "street food" },
  { icon: "🎸", label: "Coldplay" },
  { icon: "🏛", label: "Mughal history" },
  { icon: "☕", label: "cozy cafes" },
];

const LOADING_STEPS = [
  "Reading your taste…",
  "Asking Qloo's Taste AI for destinations…",
  "Pulling creator-verified places…",
  "Composing your itinerary…",
];

// Category → fallback visual (used when a place has no photo).
function catVisual(category: string | null): { emoji: string; from: string; to: string } {
  const c = (category ?? "").toLowerCase();
  if (/(street|restaurant|dhaba|food)/.test(c)) return { emoji: "🍽️", from: "#f6b26b", to: "#e2550e" };
  if (/(cafe|bakery|sweet|coffee)/.test(c)) return { emoji: "☕", from: "#cfa27a", to: "#8a5a34" };
  if (/(monument|fort|temple|mosque|tomb|minar)/.test(c)) return { emoji: "🏛️", from: "#bcae95", to: "#7c6b4f" };
  if (/(market|bazaar|shop)/.test(c)) return { emoji: "🛍️", from: "#e6a9b4", to: "#b24a63" };
  if (/(park|garden|zoo|sanctuary|attraction|lake)/.test(c)) return { emoji: "🌳", from: "#9fc79a", to: "#2f7d4f" };
  return { emoji: "📍", from: "#cdbfa6", to: "#8a7f73" };
}

export default function Home() {
  const [tastes, setTastes] = useState("");
  const [city, setCity] = useState("Delhi");
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

  function addChip(label: string) {
    setTastes((t) => (t.trim() ? `${t.replace(/[.\s]+$/, "")}, ${label}` : `I love ${label}`));
  }

  async function plan() {
    if (!tastes.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError("");
    setSteps([]);
    let i = 0;
    const iv = setInterval(() => {
      if (i < LOADING_STEPS.length) setSteps((s) => [...s, LOADING_STEPS[i++]]);
    }, 1500);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tastes: `${tastes.trim()}\n\n(I'm based in ${city}. Plan for the destination I describe; if I don't name one, plan for ${city} itself.)`,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setResult(data);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      clearInterval(iv);
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grain-overlay" />
      {/* soft ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-saffron/10 blur-3xl" />

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper">✦</span>
          <span className="font-display text-xl text-ink">TasteTrail</span>
        </div>
        <span className="rounded-full border border-line bg-paper-card px-3 py-1 text-xs text-ink-mute">
          powered by <span className="font-medium text-ink-soft">Qloo Taste AI</span>
        </span>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="pt-10 pb-8 text-center sm:pt-16"
        >
          <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-[4.25rem]">
            Your taste, your India.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
            Tell us what you love — music, films, food, anything. An AI agent plans a trip around it,
            with real places <span className="font-medium text-verified">verified by creators</span>.
          </p>
        </motion.section>

        {/* Taste input card */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto max-w-2xl"
        >
          <div className="rounded-2xl border border-line bg-paper-card p-5 shadow-sm">
            <textarea
              value={tastes}
              onChange={(e) => setTastes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) plan();
              }}
              rows={3}
              placeholder="I love A.R. Rahman, the film Inception, and great street food…"
              className="w-full resize-none bg-transparent text-lg text-ink outline-none placeholder:text-ink-mute"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => addChip(c.label)}
                  className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft transition hover:border-saffron hover:bg-saffron-soft hover:text-saffron"
                >
                  <span className="mr-1">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-sm text-ink-mute">
                Based in
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="rounded-lg border border-line bg-paper px-2 py-1 text-ink outline-none"
                >
                  <option>Delhi</option>
                  <option>Gurgaon</option>
                </select>
                <span className="hidden text-verified sm:inline">· creator-verified depth</span>
              </label>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={plan}
                disabled={loading || !tastes.trim()}
                className="rounded-xl bg-saffron px-5 py-2.5 font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-40"
              >
                {loading ? "Planning…" : "Plan my trip →"}
              </motion.button>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-ink-mute">⌘/Ctrl + Enter to plan</p>
        </motion.section>

        {/* Loading trace */}
        {loading && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto mt-8 max-w-2xl"
          >
            <div className="rounded-2xl border border-line bg-paper-card p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-mute">
                Agent working
              </p>
              <ul className="space-y-2">
                {steps.map((s, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 text-sm text-ink-soft"
                  >
                    <span className="text-verified">✓</span>
                    {s}
                  </motion.li>
                ))}
                <li className="flex items-center gap-2 text-sm text-ink-mute">
                  <span className="pulse-dot">●</span> thinking…
                </li>
              </ul>
            </div>
          </motion.section>
        )}

        {error && (
          <p className="mx-auto mt-6 max-w-2xl rounded-xl border border-saffron/30 bg-saffron-soft px-4 py-3 text-sm text-ink-soft">
            {error}
          </p>
        )}

        {/* Results */}
        {result && (
          <div ref={resultsRef} className="mt-14">
            {/* Destinations */}
            {result.destinations.length > 0 && (
              <section className="mb-12">
                <SectionLabel>Destinations for you</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">Matched to your taste by Qloo&apos;s Taste AI.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {result.destinations.slice(0, 6).map((d, i) => (
                    <motion.div
                      key={d.name}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: i * 0.06 }}
                      className="group overflow-hidden rounded-2xl border border-line bg-paper-card shadow-sm"
                    >
                      <div className="relative h-32 overflow-hidden">
                        {d.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={d.image}
                            alt={d.name}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-saffron-soft to-line" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                        <p className="absolute bottom-2 left-3 font-display text-2xl text-white drop-shadow">
                          {d.name}
                        </p>
                      </div>
                      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-ink-mute">
                        {d.city ?? "India"} · Qloo match
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Verified places — the moat */}
            {result.verifiedPlaces.length > 0 && (
              <section className="mb-12">
                <SectionLabel>In {city} — verified by creators</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">
                  Real spots vouched for in creator videos — ranked to your taste.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.verifiedPlaces.map((p, i) => {
                    const cat = catVisual(p.category);
                    return (
                      <motion.div
                        key={p.name}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.05 }}
                        className="flex gap-3 rounded-2xl border border-line bg-paper-card p-3"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                          ) : (
                            <div
                              className="grid h-full w-full place-items-center text-2xl"
                              style={{ background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` }}
                            >
                              {cat.emoji}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-medium text-ink">{p.name}</p>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-verified-soft px-2 py-0.5 text-xs font-medium text-verified">
                              ✓ {p.sources}
                            </span>
                          </div>
                          {p.specialities.length > 0 && (
                            <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                              {p.specialities.join(" · ")}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] uppercase tracking-wider text-ink-mute">
                            {[p.category, p.area].filter(Boolean).join(" · ") || "Delhi NCR"}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Narrative / day plan */}
            {result.itinerary && (
              <motion.section
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <SectionLabel>The plan</SectionLabel>
                <div className="mt-3 rounded-2xl border border-line bg-paper-card p-6">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...p }) => <h3 className="font-display text-2xl text-ink" {...p} />,
                      h2: ({ node, ...p }) => <h3 className="mt-4 font-display text-xl text-ink" {...p} />,
                      h3: ({ node, ...p }) => (
                        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-saffron" {...p} />
                      ),
                      p: ({ node, ...p }) => <p className="mt-2 leading-relaxed text-ink-soft" {...p} />,
                      strong: ({ node, ...p }) => <strong className="font-semibold text-ink" {...p} />,
                      ul: ({ node, ...p }) => <ul className="mt-2 space-y-1 text-ink-soft" {...p} />,
                      li: ({ node, ...p }) => <li className="ml-4 list-disc" {...p} />,
                    }}
                  >
                    {result.itinerary}
                  </ReactMarkdown>
                </div>
              </motion.section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-saffron">◆</span>
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">{children}</h2>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
