"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type VerifiedPlace = {
  name: string;
  category: string | null;
  area: string | null;
  sources: number;
  specialities: string[];
  tips: string[];
};
type Destination = { name: string; city: string | null };
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
  { icon: "🎭", label: "Wes Anderson films" },
  { icon: "📚", label: "Murakami novels" },
];

const LOADING_STEPS = [
  "Reading your taste…",
  "Asking Qloo's Taste AI for destinations…",
  "Pulling creator-verified places…",
  "Composing your itinerary…",
];

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
        body: JSON.stringify({ tastes: `${tastes.trim()} Focus city: ${city}.` }),
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
    <div className="relative min-h-screen">
      <div className="grain-overlay" />

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
        <section className="pt-10 pb-8 text-center sm:pt-16">
          <h1 className="font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
            Your taste, your India.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
            Tell us what you love — music, films, food, anything. An AI agent plans a trip around it,
            with real places <span className="text-verified">verified by creators</span>.
          </p>
        </section>

        {/* Taste input card */}
        <section className="mx-auto max-w-2xl">
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
                  className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft transition hover:border-saffron hover:text-saffron"
                >
                  <span className="mr-1">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <label className="flex items-center gap-2 text-sm text-ink-mute">
                Focus city
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
              <button
                onClick={plan}
                disabled={loading || !tastes.trim()}
                className="rounded-xl bg-saffron px-5 py-2.5 font-medium text-white shadow-sm transition hover:brightness-95 disabled:opacity-40"
              >
                {loading ? "Planning…" : "Plan my trip →"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-ink-mute">⌘/Ctrl + Enter to plan</p>
        </section>

        {/* Loading trace */}
        {loading && (
          <section className="mx-auto mt-8 max-w-2xl fade-up">
            <div className="rounded-2xl border border-line bg-paper-card p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-mute">
                Agent working
              </p>
              <ul className="space-y-2">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-ink-soft fade-up">
                    <span className="text-verified">✓</span>
                    {s}
                  </li>
                ))}
                <li className="flex items-center gap-2 text-sm text-ink-mute">
                  <span className="pulse-dot">●</span> thinking…
                </li>
              </ul>
            </div>
          </section>
        )}

        {error && (
          <p className="mx-auto mt-6 max-w-2xl rounded-xl border border-saffron/30 bg-saffron-soft px-4 py-3 text-sm text-ink-soft">
            {error}
          </p>
        )}

        {/* Results */}
        {result && (
          <div ref={resultsRef} className="mt-14 fade-up">
            {/* Destinations */}
            {result.destinations.length > 0 && (
              <section className="mb-12">
                <SectionLabel>Destinations for you</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">
                  Matched to your taste by Qloo&apos;s Taste AI.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {result.destinations.slice(0, 6).map((d) => (
                    <div
                      key={d.name}
                      className="rounded-xl border border-line bg-paper-card p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
                    >
                      <p className="font-display text-xl text-ink">{d.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-wider text-ink-mute">
                        {d.city ?? "India"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Verified places — the moat */}
            {result.verifiedPlaces.length > 0 && (
              <section className="mb-12">
                <SectionLabel>In {city} — verified by creators</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">
                  Real spots vouched for in creator videos — not generic listings.
                </p>
                <div className="space-y-3">
                  {result.verifiedPlaces.map((p) => (
                    <div
                      key={p.name}
                      className="flex flex-col gap-2 rounded-xl border border-line bg-paper-card p-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{p.name}</p>
                        {p.specialities.length > 0 && (
                          <p className="mt-1 text-sm text-ink-soft">{p.specialities.join(" · ")}</p>
                        )}
                        <p className="mt-1 text-xs uppercase tracking-wider text-ink-mute">
                          {[p.category, p.area].filter(Boolean).join(" · ") || "Delhi NCR"}
                        </p>
                      </div>
                      <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-verified-soft px-3 py-1 text-sm font-medium text-verified">
                        ✓ {p.sources} creator{p.sources === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Narrative / day plan */}
            {result.itinerary && (
              <section>
                <SectionLabel>The plan</SectionLabel>
                <div className="mt-3 rounded-2xl border border-line bg-paper-card p-6">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: (p) => <h3 className="font-display text-2xl text-ink" {...p} />,
                      h2: (p) => <h3 className="mt-4 font-display text-xl text-ink" {...p} />,
                      h3: (p) => (
                        <h4
                          className="mt-4 text-xs font-semibold uppercase tracking-wider text-saffron"
                          {...p}
                        />
                      ),
                      p: (p) => <p className="mt-2 leading-relaxed text-ink-soft" {...p} />,
                      strong: (p) => <strong className="font-semibold text-ink" {...p} />,
                      ul: (p) => <ul className="mt-2 space-y-1 text-ink-soft" {...p} />,
                      li: (p) => <li className="ml-4 list-disc" {...p} />,
                    }}
                  >
                    {result.itinerary}
                  </ReactMarkdown>
                </div>
              </section>
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
