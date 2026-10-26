"use client";

import { motion } from "motion/react";

type Pick = { name: string; domain: string };

const DOMAIN_ICON: Record<string, string> = { music: "🎵", film: "🎬", tv: "📺", book: "📖", brand: "✦" };

/**
 * Visualizes how Qloo's Taste AI expands the user's seed tastes across domains into the
 * recommendations — the cross-domain engine made literal. Pure SVG, no dependencies.
 */
export default function TasteGraph({ seeds, picks }: { seeds: string[]; picks: Pick[] }) {
  const S = seeds.slice(0, 5);
  const P = picks.slice(0, 8);
  if (!P.length) return null;

  const W = 760;
  const rows = Math.max(S.length, P.length, 1);
  const rowH = 46;
  const H = Math.max(rows * rowH + 40, 200);
  const midY = H / 2;
  const hubX = W / 2;
  const seedX = 130;
  const pickX = W - 130;

  const seedY = (i: number) => midY + (i - (S.length - 1) / 2) * rowH;
  const pickY = (i: number) => midY + (i - (P.length - 1) / 2) * rowH;

  return (
    <div className="ring-soft overflow-hidden rounded-2xl border border-line bg-paper-card p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 420 }} role="img" aria-label="How Qloo expanded your taste">
        {/* seed -> hub links */}
        {S.map((_, i) => (
          <path key={`sl${i}`} d={`M ${seedX + 8} ${seedY(i)} C ${(seedX + hubX) / 2} ${seedY(i)}, ${(seedX + hubX) / 2} ${midY}, ${hubX - 46} ${midY}`}
            fill="none" stroke="#e2550e" strokeOpacity="0.35" strokeWidth="1.5" />
        ))}
        {/* hub -> pick links */}
        {P.map((_, i) => (
          <path key={`pl${i}`} d={`M ${hubX + 46} ${midY} C ${(hubX + pickX) / 2} ${midY}, ${(hubX + pickX) / 2} ${pickY(i)}, ${pickX - 8} ${pickY(i)}`}
            fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
        ))}

        {/* seed nodes */}
        {S.map((s, i) => (
          <g key={`s${i}`}>
            <motion.circle initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.05 }} cx={seedX} cy={seedY(i)} r="6" fill="#e2550e" />
            <text x={seedX - 14} y={seedY(i) + 4} textAnchor="end" fontSize="13" fill="currentColor" className="font-medium">{s.length > 18 ? s.slice(0, 17) + "…" : s}</text>
          </g>
        ))}

        {/* hub */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <circle cx={hubX} cy={midY} r="44" fill="#e2550e" />
          <text x={hubX} y={midY - 3} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">Qloo</text>
          <text x={hubX} y={midY + 12} textAnchor="middle" fontSize="9" fill="#fff" fillOpacity="0.9">Taste AI</text>
        </motion.g>

        {/* pick nodes */}
        {P.map((p, i) => (
          <motion.g key={`p${i}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}>
            <text x={pickX + 14} y={pickY(i) + 4} textAnchor="start" fontSize="13" fill="currentColor">
              <tspan>{DOMAIN_ICON[p.domain] ?? "✦"} </tspan>
              <tspan className="font-medium">{p.name.length > 22 ? p.name.slice(0, 21) + "…" : p.name}</tspan>
            </text>
            <circle cx={pickX} cy={pickY(i)} r="4" fill="currentColor" fillOpacity="0.4" />
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
