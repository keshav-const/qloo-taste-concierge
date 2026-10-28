"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

type Stats = { places: number; cities: number; creators: number; claims: number };

const STEPS = [
  { n: "1", icon: "✺", title: "Share your taste", body: "Films, music, food, a vibe — whatever you love. No forms, just you." },
  { n: "2", icon: "✦", title: "Qloo's Taste AI expands it", body: "Qloo cross-matches your taste into destinations, films, music & places you'd also love." },
  { n: "3", icon: "✓", title: "Creator-verified places", body: "Every spot is vouched for in real creator videos & guides — with the receipts." },
];

/** Landing credibility bar + the 3-step "how it works" flow that makes the Qloo pipeline legible. */
export default function HowItWorks() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS).catch(() => {});
  }, []);

  const stat = (v: number | undefined, label: string) => (
    <div className="flex flex-col items-center">
      <span className="font-display text-2xl text-ink sm:text-3xl tabular-nums">
        {v != null ? v.toLocaleString("en-IN") : "—"}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-ink-mute">{label}</span>
    </div>
  );

  return (
    <div className="mt-6">
      {/* Credibility bar — the real scale of the evidence graph */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="ring-soft flex items-center justify-around gap-2 rounded-2xl border border-line bg-paper-card/70 px-4 py-4 backdrop-blur"
      >
        {stat(s?.places, "verified places")}
        <span className="h-8 w-px bg-line" />
        {stat(s?.cities, "cities")}
        <span className="h-8 w-px bg-line" />
        {stat(s?.creators, "creators")}
        <span className="hidden h-8 w-px bg-line sm:block" />
        <div className="hidden sm:flex">{stat(s?.claims, "sourced claims")}</div>
      </motion.div>

      {/* 3-step flow */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map((st, i) => (
          <motion.div
            key={st.n}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="ring-soft relative rounded-2xl border border-line bg-paper-card/70 p-4 backdrop-blur"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-saffron-soft text-saffron">{st.icon}</span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-ink-mute">Step {st.n}</span>
            </div>
            <p className="font-medium text-ink">{st.title}</p>
            <p className="mt-1 text-sm text-ink-soft">{st.body}</p>
            {i < STEPS.length - 1 && (
              <span className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 text-ink-mute sm:block">→</span>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
