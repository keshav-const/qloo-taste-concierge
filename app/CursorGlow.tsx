"use client";

// A soft warm bloom that smoothly trails the mouse pointer (spring-eased, so it follows with a
// gentle lag rather than snapping). Sits behind the content; subtle, not a spotlight.

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

const SIZE = 480; // px diameter of the bloom

export default function CursorGlow() {
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const sx = useSpring(mx, { stiffness: 45, damping: 18, mass: 0.7 });
  const sy = useSpring(my, { stiffness: 45, damping: 18, mass: 0.7 });
  const x = useTransform(sx, (v) => v - SIZE / 2);
  const y = useTransform(sy, (v) => v - SIZE / 2);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { mx.set(e.clientX); my.set(e.clientY); };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  return (
    <motion.div
      aria-hidden
      style={{ x, y, width: SIZE, height: SIZE }}
      className="pointer-events-none fixed left-0 top-0 z-0 rounded-full bg-saffron/20 blur-3xl"
    />
  );
}
