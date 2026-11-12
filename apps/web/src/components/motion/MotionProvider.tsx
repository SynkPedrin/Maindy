'use client';

import { MotionConfig } from 'motion/react';
import { ease } from '@/lib/animations';

/** Respeita prefers-reduced-motion em todas as animações de motion/react. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ ease: ease.out, duration: 0.5 }}>
      {children}
    </MotionConfig>
  );
}
