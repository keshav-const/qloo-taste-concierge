"use client";

// A continuously-scrolling strip of real India imagery along the bottom of the hero.
// Pulls thumbnails from Wikipedia (free, CORS-enabled) on mount; renders nothing until a few load.

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const PLACES = [
  "Taj Mahal", "Varanasi", "Hawa Mahal", "Golden Temple", "Kerala backwaters",
  "Hampi", "Jaisalmer Fort", "Meenakshi Temple", "Gateway of India", "Ladakh",
];

export default function HeroStrip() {
  const [imgs, setImgs] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: { name: string; url: string }[] = [];
      await Promise.all(
        PLACES.map(async (name) => {
          try {
            const r = await fetch(
              `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`,
            );
            if (!r.ok) return;
            const j = await r.json();
            const url: string | undefined = j?.thumbnail?.source;
            if (url) out.push({ name, url });
          } catch {
            /* skip */
          }
        }),
      );
      // Keep a stable order matching PLACES.
      out.sort((a, b) => PLACES.indexOf(a.name) - PLACES.indexOf(b.name));
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
            <img src={p.url} alt={p.name} className="h-7 w-7 rounded-full object-cover" />
            <span className="whitespace-nowrap text-xs font-medium text-white drop-shadow">{p.name}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
