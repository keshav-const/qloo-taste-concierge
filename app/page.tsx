"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Transition } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Suggestion = { label: string; desc: string };
type Question = { question: string; suggestions: Suggestion[] };
type VerifiedPlace = {
  name: string; category: string | null; area: string | null; sources: number;
  specialities: string[]; tips: string[];
  best_time: string | null; price_level: string | null; average_cost_inr: number | null; image: string | null;
};
type Destination = { name: string; city: string | null; image: string | null };
type PlanResult = { itinerary: string; trace: string[]; destinations: Destination[]; verifiedPlaces: VerifiedPlace[] };

const CHIPS = [
  { icon: "♫", label: "A.R. Rahman" }, { icon: "🎬", label: "Inception" }, { icon: "🍜", label: "street food" },
  { icon: "🎸", label: "Coldplay" }, { icon: "🏛", label: "Mughal history" }, { icon: "☕", label: "cozy cafes" },
];
const DESTS = ["Anywhere in India", "Delhi", "Gurgaon", "Jaipur", "Goa", "Mumbai"];
const LOADING_STEPS = ["Reading your taste…", "Asking Qloo's Taste AI for destinations…", "Pulling creator-verified places…", "Composing your itinerary…"];
const HERO_PLACES = [
  "Taj Mahal", "Hawa Mahal", "Varanasi", "Golden Temple", "Qutub Minar", "Gateway of India",
  "Kerala backwaters", "Hampi", "Mysore Palace", "Jaisalmer Fort", "Holi", "Diwali",
  "Meenakshi Temple", "Pushkar Fair", "Darjeeling", "Munnar",
];
const EASE: Transition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] };

function catVisual(category: string | null) {
  const c = (category ?? "").toLowerCase();
  if (/(street|restaurant|dhaba|food)/.test(c)) return { emoji: "🍽️", from: "#f6b26b", to: "#e2550e" };
  if (/(cafe|bakery|sweet|coffee)/.test(c)) return { emoji: "☕", from: "#cfa27a", to: "#8a5a34" };
  if (/(monument|fort|temple|mosque|tomb|minar|museum)/.test(c)) return { emoji: "🏛️", from: "#bcae95", to: "#7c6b4f" };
  if (/(market|bazaar|shop)/.test(c)) return { emoji: "🛍️", from: "#e6a9b4", to: "#b24a63" };
  if (/(park|garden|zoo|sanctuary|attraction|lake)/.test(c)) return { emoji: "🌳", from: "#9fc79a", to: "#2f7d4f" };
  return { emoji: "📍", from: "#cdbfa6", to: "#8a7f73" };
}
function priceSymbol(level: string | null) {
  switch ((level ?? "").toLowerCase()) {
    case "budget": return "₹"; case "moderate": return "₹₹"; case "expensive": return "₹₹₹"; case "luxury": return "₹₹₹₹"; default: return "";
  }
}

export default function Home() {
  const [tastes, setTastes] = useState("");
  const [dest, setDest] = useState("Anywhere in India");
  const [stage, setStage] = useState<"compose" | "questions" | "result">("compose");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<"" | "questions" | "plan">("");
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [history, setHistory] = useState<PlanResult[]>([]);
  const [reqText, setReqText] = useState("");           // the tastes the user typed
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState("");
  const [heroImgs, setHeroImgs] = useState<string[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all(HERO_PLACES.map(async (n) => {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(n)}`);
        const j = await r.json();
        return (j?.thumbnail?.source as string) ?? null;
      } catch { return null; }
    })).then((imgs) => { if (alive) setHeroImgs(imgs.filter((x): x is string => !!x)); });
    return () => { alive = false; };
  }, []);

  const addChip = (label: string) => setTastes((t) => (t.trim() ? `${t.replace(/[.\s]+$/, "")}, ${label}` : `I love ${label}`));
  const destHint = () => dest === "Anywhere in India" ? "(Suggest taste-matched destinations across India and plan the strongest match.)" : `(Destination: ${dest}.)`;
  const base = () => `${tastes.trim()}\n\n${destHint()}`;

  async function getQuestions() {
    if (!tastes.trim() || busy) return;
    setReqText(tastes.trim());
    setBusy("questions"); setError("");
    try {
      const r = await fetch("/api/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: base() }) });
      const d = await r.json();
      if (d.error) setError(d.error);
      else {
        const qs: Question[] = d.questions ?? [];
        if (qs.length) { setQuestions(qs); setAnswers(qs.map(() => "")); setStage("questions"); }
        else await runPlan(base(), []);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  async function runPlan(prompt: string, qaPairs: { q: string; a: string }[] | null) {
    if (qaPairs) setQa(qaPairs);
    setBusy("plan"); setError(""); setSteps([]);
    let i = 0;
    const iv = setInterval(() => { if (i < LOADING_STEPS.length) setSteps((s) => [...s, LOADING_STEPS[i++]]); }, 1500);
    try {
      const r = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tastes: prompt }) });
      const d = await r.json();
      if (d.error) setError(d.error);
      else {
        setResult((prev) => { if (prev) setHistory((h) => [...h, prev]); return d; });
        setStage("result");
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 120);
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { clearInterval(iv); setBusy(""); }
  }

  function createItinerary() {
    const pairs = questions.map((q, i) => ({ q: q.question, a: answers[i]?.trim() || "no preference" }));
    const detail = "\n\nMy answers:\n" + pairs.map((p) => `- ${p.q} → ${p.a}`).join("\n");
    runPlan(base() + detail, pairs);
  }

  async function refinePlan() {
    if (!refine.trim() || !result || busy) return;
    const changeRequest = refine.trim();
    const context = `${reqText}${qa.length ? "\n" + qa.map((p) => `${p.q} → ${p.a}`).join("\n") : ""}`;
    setRefine("");
    setBusy("plan"); setError(""); setSteps(["Revising your plan…"]);
    try {
      const r = await fetch("/api/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itinerary: result.itinerary, request: changeRequest, context }) });
      const d = await r.json();
      if (d.error) setError(d.error);
      else setResult((prev) => { if (!prev) return prev; setHistory((h) => [...h, prev]); return { ...prev, itinerary: d.itinerary }; });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  function planDestination(name: string) {
    const detail = qa.length ? "\n\nMy answers:\n" + qa.map((p) => `- ${p.q} → ${p.a}`).join("\n") : "";
    runPlan(`${tastes.trim()}\n\n(Destination: ${name}.)${detail}`, null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setResult(prev);
      return h.slice(0, -1);
    });
  }

  function startOver() {
    setStage("compose"); setResult(null); setHistory([]); setQuestions([]); setAnswers([]); setQa([]); setError("");
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grain-overlay" />
      <motion.div aria-hidden animate={{ x: [0, 30, 0], y: [0, 16, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} className="pointer-events-none absolute -top-44 left-1/2 h-[26rem] w-[52rem] -translate-x-1/2 rounded-full bg-saffron/10 blur-3xl" />
      <motion.div aria-hidden animate={{ x: [0, -24, 0], y: [0, 24, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} className="pointer-events-none absolute top-40 -right-40 h-[22rem] w-[22rem] rounded-full bg-verified/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper">✦</span>
          <span className="font-display text-xl text-ink">TasteTrail</span>
        </div>
        <span className="rounded-full border border-line bg-paper-card/70 px-3 py-1 text-xs text-ink-mute backdrop-blur">powered by <span className="font-medium text-ink-soft">Qloo Taste AI</span></span>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
        {/* Hero with a faded India collage background (places, culture, festivals) */}
        <section className="relative mb-2 flex min-h-[22rem] items-center justify-center overflow-hidden rounded-3xl py-12 sm:min-h-[26rem]">
          {heroImgs.length >= 6 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} className="pointer-events-none absolute inset-0">
              <div className="grid h-full w-full grid-cols-4 grid-rows-3 gap-1 opacity-[0.28] sm:grid-cols-6 sm:grid-rows-3">
                {heroImgs.slice(0, 18).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" className="h-full w-full object-cover" />
                ))}
              </div>
              {/* readability overlay: fade to paper at top/bottom + a warm center wash */}
              <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/70 to-paper" />
              <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(244,238,227,0.55),transparent)]" />
            </motion.div>
          )}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={EASE} className="relative z-10 px-4 text-center">
            <h1 className="font-display text-5xl leading-[1.05] text-ink drop-shadow-[0_1px_8px_rgba(244,238,227,0.9)] sm:text-[4.75rem]">
              Your taste, your{" "}
              <span style={{ background: "linear-gradient(110deg, #e2550e, #c23d6a 38%, #0d6e5b 68%, #e2550e)", backgroundSize: "260% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", animation: "gradient-shift 9s ease-in-out infinite" }}>India</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
              Tell us what you love. We&apos;ll ask a couple of quick questions, then plan a trip anywhere in India — with real places <span className="font-medium text-verified">verified by creators</span>.
            </p>
          </motion.div>
        </section>

        {/* STAGE: compose */}
        {stage === "compose" && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...EASE, delay: 0.08 }} className="mx-auto max-w-2xl">
            <div className="ring-soft rounded-2xl border border-line bg-paper-card/80 p-5 backdrop-blur">
              <textarea value={tastes} onChange={(e) => setTastes(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) getQuestions(); }} rows={3}
                placeholder="e.g. Travelling with family over a long weekend — parents want pilgrimage, we love light hiking…"
                className="w-full resize-none bg-transparent text-lg text-ink outline-none placeholder:text-ink-mute" />
              <div className="mt-3 flex flex-wrap gap-2">
                {CHIPS.map((c) => (
                  <motion.button key={c.label} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} onClick={() => addChip(c.label)} className="rounded-full border border-line px-3 py-1 text-sm text-ink-soft transition-colors hover:border-saffron hover:bg-saffron-soft hover:text-saffron"><span className="mr-1">{c.icon}</span>{c.label}</motion.button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <label className="flex items-center gap-2 text-sm text-ink-mute">Where to?
                  <select value={dest} onChange={(e) => setDest(e.target.value)} className="rounded-lg border border-line bg-paper px-2 py-1 text-ink outline-none">{DESTS.map((d) => <option key={d}>{d}</option>)}</select>
                </label>
                <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={getQuestions} disabled={!!busy || !tastes.trim()}
                  style={{ background: "linear-gradient(120deg, #f0702a, #e2550e 45%, #c9430a, #e2550e)", backgroundSize: "220% 100%", animation: "gradient-shift 6s ease-in-out infinite" }}
                  className="rounded-xl px-5 py-2.5 font-medium text-white shadow-sm transition hover:brightness-105 disabled:opacity-40">{busy === "questions" ? "Thinking…" : "Continue →"}</motion.button>
              </div>
            </div>
          </motion.section>
        )}

        {/* STAGE: questions */}
        {stage === "questions" && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={EASE} className="mx-auto max-w-2xl">
            <div className="ring-soft rounded-2xl border border-line bg-paper-card/80 p-5 backdrop-blur">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-saffron">A few quick questions</p>
              <p className="mb-4 text-sm text-ink-mute">Tap a suggestion or type your own — skip what you like.</p>
              <div className="space-y-5">
                {questions.map((q, i) => {
                  const typed = answers[i] && !q.suggestions.some((s) => s.label === answers[i]);
                  return (
                    <div key={i}>
                      <p className="mb-2 text-sm font-medium text-ink">{q.question}</p>
                      <div className="flex flex-wrap gap-2">
                        {q.suggestions.map((s) => {
                          const active = answers[i] === s.label;
                          return (
                            <button key={s.label} onClick={() => setAnswers((a) => a.map((v, j) => (j === i ? (v === s.label ? "" : s.label) : v)))}
                              className={`max-w-[15rem] rounded-xl border px-3 py-2 text-left transition ${active ? "border-saffron bg-saffron-soft" : "border-line hover:border-ink-mute"}`}>
                              <span className="block text-sm font-medium text-ink">{s.label}</span>
                              {s.desc && <span className="block text-xs text-ink-mute">{s.desc}</span>}
                            </button>
                          );
                        })}
                      </div>
                      <input value={typed ? answers[i] : ""} onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                        placeholder="Or type your own…" className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-saffron" />
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <button onClick={() => runPlan(base(), [])} className="text-sm text-ink-mute underline-offset-2 hover:text-ink hover:underline">Skip &amp; plan now</button>
                <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={createItinerary} disabled={!!busy}
                  style={{ background: "linear-gradient(120deg, #f0702a, #e2550e 45%, #c9430a, #e2550e)", backgroundSize: "220% 100%", animation: "gradient-shift 6s ease-in-out infinite" }}
                  className="rounded-xl px-5 py-2.5 font-medium text-white shadow-sm transition hover:brightness-105 disabled:opacity-40">{busy === "plan" ? "Planning…" : "Create itinerary →"}</motion.button>
              </div>
            </div>
          </motion.section>
        )}

        {busy === "plan" && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto mt-8 max-w-2xl">
            <div className="rounded-2xl border border-line bg-paper-card/80 p-5 backdrop-blur">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-mute">Agent working</p>
              <ul className="space-y-2">
                {steps.map((s, i) => <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-sm text-ink-soft"><span className="text-verified">✓</span>{s}</motion.li>)}
                <li className="flex items-center gap-2 text-sm text-ink-mute"><span className="pulse-dot">●</span> thinking…</li>
              </ul>
            </div>
          </motion.section>
        )}

        {error && <p className="mx-auto mt-6 max-w-2xl rounded-xl border border-saffron/30 bg-saffron-soft px-4 py-3 text-sm text-ink-soft">{error}</p>}

        {/* STAGE: result */}
        {stage === "result" && result && (
          <div ref={resultsRef} className="mt-12">
            {/* Your request + back */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <details className="group min-w-0 flex-1">
                <summary className="cursor-pointer list-none text-sm text-ink-mute hover:text-ink">
                  <span className="font-medium text-ink-soft">Your request</span> — tap to see what you asked ▾
                </summary>
                <div className="mt-2 rounded-xl border border-line bg-paper-card/70 p-3 text-sm text-ink-soft">
                  {reqText && <p className="mb-2">“{reqText}”</p>}
                  {qa.length > 0 && (
                    <ul className="space-y-0.5 text-ink-mute">
                      {qa.map((p, i) => <li key={i}><span className="text-ink-soft">{p.q}</span> → {p.a}</li>)}
                    </ul>
                  )}
                </div>
              </details>
              {history.length > 0 && (
                <button onClick={goBack} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition hover:border-ink hover:text-ink">← Previous plan</button>
              )}
            </div>

            {result.destinations.length > 0 && (
              <section className="mb-12">
                <SectionLabel>Destinations across India</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">Matched to your taste by Qloo&apos;s Taste AI — tap one to plan it.</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {result.destinations.slice(0, 6).map((d, i) => (
                    <motion.button key={d.name} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -4 }} onClick={() => planDestination(d.name)} disabled={!!busy}
                      className="ring-soft group block overflow-hidden rounded-2xl border border-line bg-paper-card text-left transition hover:border-saffron disabled:opacity-60">
                      <div className="relative h-36 overflow-hidden">
                        {d.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.image} alt={d.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                        ) : <div className="h-full w-full bg-gradient-to-br from-saffron-soft via-paper to-verified-soft" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                        <p className="absolute bottom-2 left-3 font-display text-2xl text-white drop-shadow">{d.name}</p>
                        <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100"><span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-ink shadow">Plan this trip →</span></div>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2"><span className="text-[11px] uppercase tracking-wider text-ink-mute">{d.city ?? "India"} · Qloo match</span><span className="text-xs text-saffron opacity-0 transition group-hover:opacity-100">↗</span></div>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {result.verifiedPlaces.length > 0 && (
              <section className="mb-12">
                <SectionLabel>Verified by creators</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">Real spots vouched for in creator videos — ranked to your taste, with timing &amp; price.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.verifiedPlaces.map((p, i) => {
                    const cat = catVisual(p.category); const price = priceSymbol(p.price_level);
                    return (
                      <motion.div key={p.name} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.45, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -2 }} className="ring-soft flex gap-3 rounded-2xl border border-line bg-paper-card p-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                          {p.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                          ) : <div className="grid h-full w-full place-items-center text-2xl" style={{ background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` }}>{cat.emoji}</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2"><p className="font-medium text-ink">{p.name}</p><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-verified-soft px-2 py-0.5 text-xs font-medium text-verified">✓ {p.sources}</span></div>
                          {p.specialities.length > 0 && <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{p.specialities.join(" · ")}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {(price || p.average_cost_inr) && <span className="pill bg-saffron-soft text-saffron">{price}{p.average_cost_inr ? ` ~₹${p.average_cost_inr}` : ""}</span>}
                            {p.best_time && <span className="pill bg-verified-soft text-verified">🕒 {p.best_time.slice(0, 22)}</span>}
                            <span className="pill border border-line text-ink-mute">{[p.category, p.area].filter(Boolean).join(" · ") || "Delhi NCR"}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

            {result.itinerary && (
              <section>
                <SectionLabel>The plan</SectionLabel>
                <div className="ring-soft mt-3 rounded-2xl border border-line bg-paper-card p-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                    h1: ({ node, ...p }) => <h3 className="font-display text-2xl text-ink" {...p} />,
                    h2: ({ node, ...p }) => <h3 className="mt-4 font-display text-xl text-ink" {...p} />,
                    h3: ({ node, ...p }) => <h4 className="mt-5 text-sm font-semibold text-ink" {...p} />,
                    p: ({ node, ...p }) => <p className="mt-2 leading-relaxed text-ink-soft" {...p} />,
                    strong: ({ node, ...p }) => <strong className="font-semibold text-ink" {...p} />,
                    ul: ({ node, ...p }) => <ul className="mt-1.5 space-y-1 text-ink-soft" {...p} />,
                    li: ({ node, ...p }) => <li className="ml-4 list-disc marker:text-saffron" {...p} />,
                    table: ({ node, ...p }) => <div className="mt-2 overflow-x-auto"><table className="w-full text-sm" {...p} /></div>,
                    th: ({ node, ...p }) => <th className="border-b border-line px-2 py-1 text-left font-medium text-ink" {...p} />,
                    td: ({ node, ...p }) => <td className="border-b border-line/50 px-2 py-1 align-top text-ink-soft" {...p} />,
                  }}>{result.itinerary}</ReactMarkdown>
                </div>
              </section>
            )}

            <div className="ring-soft mt-6 rounded-2xl border border-line bg-paper-card/80 p-4 backdrop-blur">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-saffron">Not quite right? Refine or ask</p>
              <div className="flex flex-wrap gap-2">
                <input value={refine} onChange={(e) => setRefine(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") refinePlan(); }} disabled={!!busy}
                  placeholder="e.g. make day 2 more relaxed · add a street-food night · what's the best time for day 1?"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-saffron" />
                <motion.button whileTap={{ scale: 0.97 }} onClick={refinePlan} disabled={!!busy || !refine.trim()} style={{ background: "linear-gradient(120deg, #f0702a, #e2550e 45%, #c9430a, #e2550e)", backgroundSize: "220% 100%" }} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-105 disabled:opacity-40">{busy === "plan" ? "Updating…" : "Update plan"}</motion.button>
                <button onClick={startOver} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft transition hover:border-ink hover:text-ink">Start over</button>
              </div>
            </div>
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
      <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
    </div>
  );
}
