import type { Transition, Variants } from 'motion/react';

/** Sistema central de motion da MAINDY. Anime apenas transform e opacity sempre que possível. */
export const ease = {
  out: [0.16, 1, 0.3, 1] as const, // saídas suaves, padrão da marca
  inOut: [0.65, 0, 0.35, 1] as const,
  spring: { type: 'spring', stiffness: 260, damping: 26 } as const,
};

export const duration = { fast: 0.2, base: 0.5, slow: 0.9, ambient: 6 } as const;
export const stagger = { tight: 0.06, base: 0.1, loose: 0.16 } as const;

export const transition = (d: keyof typeof duration = 'base', delay = 0): Transition => ({
  duration: duration[d],
  ease: ease.out,
  delay,
});

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: transition('slow') },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition('slow') },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: transition('slow') },
};

export const staggerContainer = (s: keyof typeof stagger = 'base', delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger[s], delayChildren } },
});

/** Viewport padrão para reveals por scroll. */
export const revealViewport = { once: true, margin: '0px 0px -12% 0px' } as const;
