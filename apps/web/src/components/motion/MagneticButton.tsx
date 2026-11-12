'use client';

import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useRef } from 'react';

/** Atração magnética discreta (máx. 6px), só em ponteiro fino e sem reduced-motion. */
export function Magnetic({ children, strength = 6, className = '' }: { children: React.ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18 });

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width - 0.5) * strength * 2);
    y.set(((e.clientY - r.top) / r.height - 0.5) * strength * 2);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span ref={ref} style={{ x, y }} onPointerMove={onMove} onPointerLeave={reset} className={`inline-flex ${className}`}>
      {children}
    </motion.span>
  );
}
