'use client';

import { motion, type Variants } from 'motion/react';
import { fadeUp, revealViewport } from '@/lib/animations';

type Tag = 'div' | 'section' | 'li' | 'p' | 'h2' | 'h3' | 'span' | 'ul' | 'article';

interface RevealProps {
  children: React.ReactNode;
  as?: Tag;
  className?: string;
  variants?: Variants;
  delay?: number;
  id?: string;
}

/** Revela o conteúdo quando entra na viewport (uma vez). */
export function Reveal({ children, as = 'div', className, variants = fadeUp, delay = 0, id }: RevealProps) {
  const Component = motion[as];
  return (
    <Component
      id={id}
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={revealViewport}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </Component>
  );
}
