"use client";

// India's destinations AND its culture (music, film, dance, festivals) — Qloo is a culture graph,
// so the hero is a cultural tapestry, not just places. Hovering a chip pauses the marquee and
// opens a small card with a short description (from Wikipedia).

import { useEffect, useState } from "react";

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

type Card = { label: string; url: string; kind: Item["kind"]; desc: string };

export default function HeroStrip() {
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Card[] = [];
      await Promise.all(
        ITEMS.map(async (it) => {
          try {
            const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(it.q)}`);
            if (!r.ok) return;
            const j = await r.json();
            const url: string | undefined = j?.thumbnail?.source;
            if (!url) return;
            const extract: string = (j?.extract ?? "").toString();
            out.push({ label: it.label, url, kind: it.kind, desc: extract.slice(0, 160) });
          } catch {
            /* skip */
          }
        }),
      );
      out.sort((a, b) => ITEMS.findIndex((i) => i.label === a.label) - ITEMS.findIndex((i) => i.label === b.label));
      if (alive) setCards(out);
    })();
    return () => { alive = false; };
  }, []);

  if (cards.length < 4) return null;
  const row = [...cards, ...cards]; // duplicated for a seamless loop

  return (
    // No overflow-clip/mask here: the hero section already clips horizontally, and a mask would
    // hide the hover card (which sits above the strip). Horizontal fade is done with edge overlays.
    <div className="marquee-group pointer-events-none absolute inset-x-0 bottom-5 z-20">
      <div className="animate-marquee flex w-max gap-3 px-4">
        {row.map((p, i) => (
          <div key={i} className="group/chip pointer-events-auto relative shrink-0">
            {/* hover card — compact, calm, appears above the chip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2.5 w-52 -translate-x-1/2 translate-y-1 rounded-xl border border-line bg-paper-card/95 p-2.5 text-left opacity-0 shadow-lg backdrop-blur transition-all duration-200 ease-out group-hover/chip:translate-y-0 group-hover/chip:opacity-100">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.label} className="h-9 w-9 rounded-lg object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{p.label}</p>
                  <p className="text-[9px] font-medium uppercase tracking-wider text-saffron">{p.kind === "culture" ? "Culture" : "Destination"}</p>
                </div>
              </div>
              {p.desc && <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-ink-mute">{p.desc}…</p>}
              {/* little pointer */}
              <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-line bg-paper-card/95" />
            </div>
            {/* chip */}
            <div className="flex items-center gap-2 rounded-full border border-white/40 bg-black/25 py-1 pl-1 pr-3 backdrop-blur-sm transition group-hover/chip:border-white/80 group-hover/chip:bg-black/45">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.label} className="h-7 w-7 rounded-full object-cover" />
              <span className="whitespace-nowrap text-xs font-medium text-white drop-shadow">
                <span className="mr-1 opacity-90">{p.kind === "culture" ? "✦" : "📍"}</span>{p.label}
              </span>
            </div>
          </div>
        ))}
      </div>
      {/* subtle edge fades (don't clip the hover card) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-paper/70 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-paper/70 to-transparent" />
    </div>
  );
}
