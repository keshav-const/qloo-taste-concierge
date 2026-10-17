"use client";

// Floating glass-pill navbar (ported from Rasta). Sticky: stays pinned on scroll; the
// backing firms up slightly once scrolled so it reads over the paper background too.

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import GlassSurface from "./GlassSurface";

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
      className="fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      {/* Warm-tinted backing behind the transparent glass so the pill reads vibrant, not grey. */}
      <div
        className={`relative w-full max-w-3xl rounded-full transition-all duration-500 ${
          scrolled
            ? "bg-paper/75 ring-1 ring-saffron/20 shadow-[0_16px_44px_-24px_rgba(226,85,14,0.35)]"
            : "bg-saffron-soft/40 ring-1 ring-saffron/25 shadow-[0_16px_44px_-18px_rgba(226,85,14,0.30)]"
        }`}
      >
        <GlassSurface
          width="100%"
          height={56}
          borderRadius={40}
          backgroundOpacity={0}
          saturation={1.9}
          brightness={70}
          blur={11}
          displace={1}
          distortionScale={-140}
          greenOffset={12}
          blueOffset={22}
          className="!w-full"
        >
          <div className="flex w-full items-center justify-between pl-3 pr-2.5">
            <a href="/" className="flex items-center gap-2.5">
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-paper shadow-sm"
                style={{ background: "linear-gradient(120deg, #f0702a, #e2550e 45%, #c9430a)" }}
              >✦</span>
              <span
                className="font-display text-lg font-semibold tracking-tight"
                style={{ background: "linear-gradient(110deg, #e2550e, #c23d6a 48%, #0d6e5b)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
              >TasteTrail</span>
            </a>
            <span className="rounded-full bg-paper-card/70 px-3.5 py-1.5 text-xs text-ink-soft ring-1 ring-saffron/15">
              powered by <span className="font-semibold text-saffron">Qloo Taste AI</span>
            </span>
          </div>
        </GlassSurface>
      </div>
    </motion.header>
  );
}
