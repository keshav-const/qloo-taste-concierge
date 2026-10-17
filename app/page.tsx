"use client";

import { useRef, useState } from "react";
import { motion, type Transition } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import HeroVideo from "./HeroVideo";

type Suggestion = { label: string; desc: string };
type Question = { question: string; suggestions: Suggestion[] };
type VerifiedPlace = {
  name: string; category: string | null; area: string | null; sources: number;
  specialities: string[]; tips: string[];
  best_time: string | null; price_level: string | null; average_cost_inr: number | null; image: string | null;
  qloo_ranked?: boolean;
};
type Destination = { name: string; city: string | null; image: string | null; why?: string; affinity?: number };
type CulturalPick = { name: string; domain: string; image: string | null };
type PlanResult = {
  itinerary: string; trace: string[];
  destinations: Destination[]; verifiedPlaces: VerifiedPlace[]; culturalVibe: CulturalPick[];
};

const CULTURE_META: Record<string, { icon: string; label: string }> = {
  film: { icon: "🎬", label: "Film" },
  tv: { icon: "📺", label: "Show" },
  music: { icon: "🎵", label: "Artist" },
  book: { icon: "📖", label: "Book" },
};

const CHIPS = [
  { icon: "♫", label: "A.R. Rahman" }, { icon: "🎬", label: "Inception" }, { icon: "🍜", label: "street food" },
  { icon: "🎸", label: "Coldplay" }, { icon: "🏛", label: "Mughal history" }, { icon: "☕", label: "cozy cafes" },
];
const DESTS = ["Anywhere in India", "Delhi", "Gurgaon", "Jaipur", "Goa", "Mumbai"];
const LOADING_STEPS = ["Reading your taste…", "Asking Qloo's Taste AI for destinations…", "Pulling creator-verified places…", "Composing your itinerary…"];
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
  const [selected, setSelected] = useState<string[][]>([]); // multi-select labels per question
  const [typed, setTyped] = useState<string[]>([]);          // free text per question
  const [refine, setRefine] = useState("");
  const [busy, setBusy] = useState<"" | "questions" | "plan">("");
  const [steps, setSteps] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [history, setHistory] = useState<PlanResult[]>([]);
  const [reqText, setReqText] = useState("");           // the tastes the user typed
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState("");
  const resultsRef = useRef<HTMLDivElement>(null);

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
        if (qs.length) { setQuestions(qs); setSelected(qs.map(() => [])); setTyped(qs.map(() => "")); setStage("questions"); }
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
    const pairs = questions.map((q, i) => {
      const parts = [...(selected[i] ?? []), (typed[i] ?? "").trim()].filter(Boolean);
      return { q: q.question, a: parts.length ? parts.join(", ") : "no preference" };
    });
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
    setStage("compose"); setResult(null); setHistory([]); setQuestions([]); setSelected([]); setTyped([]); setQa([]); setError("");
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
        {/* Hero — full-bleed looping India montage (intro/outro trimmed) */}
        <section className="relative left-1/2 mb-8 flex min-h-[26rem] w-screen -translate-x-1/2 items-center justify-center overflow-hidden py-16 sm:min-h-[34rem]">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <HeroVideo />
            {/* readability wash + fade into the page */}
            <div className="absolute inset-0 bg-paper/45" />
            <div className="absolute inset-0 bg-gradient-to-b from-paper/30 via-paper/20 to-paper" />
          </div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={EASE} className="relative z-10 px-4 text-center">
            <h1 className="font-display text-5xl leading-[1.05] text-ink drop-shadow-[0_2px_12px_rgba(244,238,227,0.95)] sm:text-[4.75rem]">
              Your taste, your{" "}
              <span style={{ background: "linear-gradient(110deg, #e2550e, #c23d6a 38%, #0d6e5b 68%, #e2550e)", backgroundSize: "260% 100%", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", animation: "gradient-shift 9s ease-in-out infinite" }}>India</span>.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg font-medium text-ink-soft drop-shadow-[0_1px_8px_rgba(244,238,227,0.95)]">
              Tell us what you love. We&apos;ll ask a couple of quick questions, then plan a trip anywhere in India — with real places <span className="text-verified">verified by creators</span>.
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
              <p className="mb-4 text-sm text-ink-mute">Pick any that fit (you can choose several) or type your own.</p>
              <div className="space-y-5">
                {questions.map((q, i) => (
                  <div key={i}>
                    <p className="mb-2 text-sm font-medium text-ink">{q.question} <span className="text-xs font-normal text-ink-mute">· pick any</span></p>
                    <div className="flex flex-wrap gap-2">
                      {q.suggestions.map((s) => {
                        const active = (selected[i] ?? []).includes(s.label);
                        return (
                          <button key={s.label}
                            onClick={() => setSelected((sel) => sel.map((arr, j) => (j === i ? (arr.includes(s.label) ? arr.filter((x) => x !== s.label) : [...arr, s.label]) : arr)))}
                            className={`max-w-[15rem] rounded-xl border px-3 py-2 text-left transition ${active ? "border-saffron bg-saffron-soft" : "border-line hover:border-ink-mute"}`}>
                            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">{active && <span className="text-saffron">✓</span>}{s.label}</span>
                            {s.desc && <span className="block text-xs text-ink-mute">{s.desc}</span>}
                          </button>
                        );
                      })}
                    </div>
                    <input value={typed[i] ?? ""} onChange={(e) => setTyped((t) => t.map((v, j) => (j === i ? e.target.value : v)))}
                      placeholder="Add your own…" className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-saffron" />
                  </div>
                ))}
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

            {result.culturalVibe && result.culturalVibe.length > 0 && (
              <section className="mb-12">
                <SectionLabel>Your cultural vibe</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">Films, shows, music &amp; books Qloo says share your taste DNA — the cross-domain thread behind your trip.</p>
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                  {result.culturalVibe.map((c, i) => {
                    const m = CULTURE_META[c.domain] ?? { icon: "✨", label: "Pick" };
                    return (
                      <motion.div key={c.name + i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.4, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                        className="ring-soft w-32 shrink-0 overflow-hidden rounded-2xl border border-line bg-paper-card">
                        <div className="relative h-40 overflow-hidden">
                          {c.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
                          ) : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-saffron-soft via-paper to-verified-soft text-3xl">{m.icon}</div>}
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">{m.icon} {m.label}</span>
                        </div>
                        <p className="line-clamp-2 px-2 py-1.5 text-xs font-medium leading-snug text-ink">{c.name}</p>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            )}

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
                      <div className="px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider text-ink-mute">{d.city ?? "India"}{typeof d.affinity === "number" ? ` · ${Math.round(d.affinity * 100)}% match` : " · Qloo match"}</span>
                          <span className="text-xs text-saffron opacity-0 transition group-hover:opacity-100">↗</span>
                        </div>
                        {d.why && <p className="mt-1 line-clamp-2 text-xs text-ink-soft"><span className="text-saffron">✨</span> {d.why}</p>}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {result.verifiedPlaces.length > 0 && (
              <section className="mb-12">
                <SectionLabel>Verified by creators</SectionLabel>
                <p className="mb-5 text-sm text-ink-mute">Real spots vouched for in creator videos — ranked to your taste. <span className="font-medium text-ink-soft">✨ Qloo pick</span> = Qloo&apos;s Taste AI independently surfaced it too.</p>
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
                            {p.qloo_ranked && <span className="pill bg-ink text-paper">✨ Qloo pick</span>}
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
