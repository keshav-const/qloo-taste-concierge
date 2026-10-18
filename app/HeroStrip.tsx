"use client";

// A continuously-scrolling strip of real India imagery along the bottom of the hero.
// Pulls thumbnails from Wikipedia (free, CORS-enabled) on mount; renders nothing until a few load.

import { useEffect, useState } from "react";
import { motion } from "motion/react";

// India's destinations AND its culture (music, film, dance, festivals) — Qloo is a culture graph,
// so the hero should feel like a cultural tapestry, not just a list of places. `q` is the Wikipedia
// lookup, `label` the chip text, `kind` a tiny marker.
type Item = { label: string; q: string; kind: "place" | "culture" };
const ITEMS: Item[] = [
  { label: "Taj Mahal", q: "Taj Mahal", kind: "place" },
  { label: "A.R. Rahman", q: "A. R. Rahman", kind: "culture" },
  { label: "Varanasi", q: "Varanasi", kind: "place" },
  { label: "Kathakali", q: "Kathakali", kind: "culture" },
  { label: "Hawa Mahal", q: "Hawa Mahal", kind: "place" },
  { label: "Satyajit Ray", q: "Satyajit Ray", kind: "culture" },
  { label: "Golden Temple", q: "Golden Temple", kind: "place" },
  { label: "Holi", q: "Holi", kind: "culture" },
  { label: "Kerala backwaters", q: "Kerala backwaters", kind: "place" },
  { label: "Bharatanatyam", q: "Bharatanatyam", kind: "culture" },
  { label: "Hampi", q: "Hampi", kind: "place" },
  { label: "Durga Puja", q: "Durga Puja", kind: "culture" },
  { label: "Jaisalmer Fort", q: "Jaisalmer Fort", kind: "place" },
  { label: "Sitar", q: "Sitar", kind: "culture" },
  { label: "Meenakshi Temple", q: "Meenakshi Temple", kind: "place" },
  { label: "Diwali", q: "Diwali", kind: "culture" },
  { label: "Ladakh", q: "Ladakh", kind: "place" },
  { label: "Madhubani art", q: "Madhubani art", kind: "culture" },
];

export default function HeroStrip() {
  const [imgs, setImgs] = useState<{ label: string; url: string; kind: Item["kind"] }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: { label: string; url: string; kind: Item["kind"] }[] = [];
      await Promise.all(
        ITEMS.map(async (it) => {
          try {
            const r = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(it.q)}`,
            );
            if (!r.ok) return;
            const j = await r.json();
            const url: string | undefined = j?.thumbnail?.source;
            if (url) out.push({ label: it.label, url, kind: it.kind });
          } catch {
            /* skip */
          }
        }),
      );
      // Keep a stable interleaved order matching ITEMS.
      out.sort((a, b) => ITEMS.findIndex((i) => i.label === a.label) - ITEMS.findIndex((i) => i.label === b.label));
      if (alive) setImgs(out);
    })();
    return () => { alive = false; };
  }, []);

  if (imgs.length < 4) return null;
  const row = [...imgs, ...imgs]; // duplicated for a seamless loop

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <motion.div
        className="flex w-max gap-3 px-4"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
      >
        {row.map((p, i) => (
          <div key={i} className="flex items-center gap-2 rounded-full border border-white/40 bg-black/25 py-1 pl-1 pr-3 backdrop-blur-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} className="h-7 w-7 rounded-full object-cover" />
            <span className="whitespace-nowrap text-xs font-medium text-white drop-shadow">
              <span className="mr-1 opacity-90">{p.kind === "culture" ? "✦" : "📍"}</span>{p.label}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
