"use client";

// Floating glass-pill navbar — sticky. Uses a plain CSS frosted pill (translucent warm paper +
// backdrop-blur) instead of an SVG-filter glass, because Chrome mis-paints SVG backdrop-filters
// as a full-width grey band over a light hero.

import { useEffect, useState } from "react";
import { motion } from "motion/react";

export default function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-x-0 top-5 z-50 flex justify-center px-4"
    >
      <div
        className={`flex w-full max-w-4xl items-center justify-between gap-3 rounded-full border px-5 py-3.5 backdrop-blur-xl transition-all duration-500 ${
          scrolled
            ? "border-saffron/20 bg-paper/85 shadow-[0_18px_50px_-24px_rgba(226,85,14,0.45)]"
            : "border-white/50 bg-paper/60 shadow-[0_18px_55px_-20px_rgba(226,85,14,0.4)]"
        }`}
      >
        <a href="/" className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl text-lg text-paper shadow-sm"
            style={{ background: "linear-gradient(120deg, #f0702a, #e2550e 45%, #c9430a)" }}
          >✦</span>
          <span
            className="font-display text-2xl font-semibold tracking-tight"
            style={{ background: "linear-gradient(110deg, #e2550e, #c23d6a 48%, #0d6e5b)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
          >TasteTrail</span>
        </a>
        <span className="rounded-full bg-paper-card/80 px-4 py-2 text-sm text-ink-soft ring-1 ring-saffron/15">
          powered by <span className="font-semibold text-saffron">Qloo Taste AI</span>
        </span>
      </div>
    </motion.header>
  );
}
