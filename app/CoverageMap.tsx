"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

type City = { city: string; lat: number; lng: number; count: number };

// India bbox for an equirectangular projection; lng compressed by cos(midLat) to limit distortion.
const LNG0 = 67, LNG1 = 98.5, LAT0 = 6, LAT1 = 37.5;
const COSLAT = Math.cos(((LAT0 + LAT1) / 2) * Math.PI / 180);
const W = 360, H = 400;
const project = (lng: number, lat: number): [number, number] => {
  const x = ((lng - LNG0) / ((LNG1 - LNG0) * COSLAT)) * (W * COSLAT);
  const y = ((LAT1 - lat) / (LAT1 - LAT0)) * H;
  return [x, y];
};
const TITLE = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default function CoverageMap() {
  const [rings, setRings] = useState<[number, number][][]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [total, setTotal] = useState(0);
  const [hover, setHover] = useState<City | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/india-outline.json").then((r) => r.json()).then((d: { rings: number[][][] }) => {
      setRings(d.rings.map((ring) => ring.map(([lng, lat]) => project(lng, lat))));
    }).catch(() => {});
    fetch("/api/depth-map").then((r) => r.json()).then((d: { cities: City[]; total: number }) => {
      setCities(d.cities ?? []);
      setTotal(d.total ?? 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Skeleton while the coverage data loads — keeps the slot filled (no blank space / layout shift).
  if (loading) {
    return (
      <div className="ring-soft rounded-3xl border border-line bg-paper-card/70 p-5 backdrop-blur">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-saffron">Creator-verified depth</p>
          <div className="h-4 w-28 animate-pulse rounded bg-line/50" />
        </div>
        <p className="mb-3 text-sm text-ink-mute">Where we have real, creator-vouched places on the ground — growing across India.</p>
        <div className="mx-auto w-full animate-pulse rounded-2xl bg-line/30" style={{ maxWidth: 360, aspectRatio: "360 / 400" }} />
      </div>
    );
  }
  if (!cities.length) return null;
  const maxCount = Math.max(...cities.map((c) => c.count), 1);
  const r = (n: number) => 3 + Math.sqrt(n / maxCount) * 7; // dot radius by POI count

  return (
    <div className="ring-soft rounded-3xl border border-line bg-paper-card/70 p-5 backdrop-blur">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-saffron">Creator-verified depth</p>
        <p className="text-sm text-ink-mute"><span className="font-semibold text-ink">{total}</span> places · <span className="font-semibold text-ink">{cities.length}</span> cities</p>
      </div>
      <p className="mb-3 text-sm text-ink-mute">Where we have real, creator-vouched places on the ground — growing across India.</p>
      <div className="relative mx-auto" style={{ maxWidth: 360 }}>
        <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="w-full" role="img" aria-label="Map of verified-coverage cities across India">
          {/* India outline (official boundary) */}
          {rings.map((ring, i) => (
            <polygon key={i} points={ring.map((p) => p.join(",")).join(" ")} fill="#e2550e" fillOpacity={i === 0 ? 0.06 : 0.06} stroke="#e2550e" strokeOpacity="0.45" strokeWidth="0.8" />
          ))}
          {/* depth-city dots */}
          {cities.map((c) => {
            const [x, y] = project(c.lng, c.lat);
            return (
              <g key={c.city} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} onClick={() => setHover((h) => (h?.city === c.city ? null : c))} style={{ cursor: "pointer" }}>
                <motion.circle initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.4 }} cx={x} cy={y} r={r(c.count)} fill="#e2550e" fillOpacity="0.85" stroke="#fff" strokeWidth="0.8" />
              </g>
            );
          })}
        </svg>
        {hover && (() => {
          const [x, y] = project(hover.lng, hover.lat);
          return (
            <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-ink px-2 py-1 text-xs text-paper shadow-lg"
              style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}>
              <span className="font-semibold">{TITLE(hover.city)}</span> · {hover.count} places
            </div>
          );
        })()}
      </div>
    </div>
  );
}
