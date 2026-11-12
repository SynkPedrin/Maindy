'use client';

import Image from 'next/image';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'responding';

interface OrbProps {
  size?: string; // classe de tamanho Tailwind
  state?: OrbState;
  /** Inclina e desloca o brilho conforme o cursor (desktop). */
  reactive?: boolean;
  priority?: boolean;
  className?: string;
}

/**
 * A esfera MAINDY: logo original + camadas de luz em CSS.
 * Estados: idle (respiração), listening (ondas), thinking (partículas orbitando), responding (brilho intenso).
 */
export function Orb({ size = 'size-72', state = 'idle', reactive = false, priority = false, className = '' }: OrbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 80, damping: 18 });
  const sy = useSpring(my, { stiffness: 80, damping: 18 });
  const rotateY = useTransform(sx, [-1, 1], [-10, 10]);
  const rotateX = useTransform(sy, [-1, 1], [8, -8]);
  const glowX = useTransform(sx, [-1, 1], ['30%', '70%']);
  const glowY = useTransform(sy, [-1, 1], ['30%', '70%']);

  useEffect(() => {
    if (!reactive || reduce) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    if (!fine) return;
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      mx.set(Math.max(-1, Math.min(1, nx)));
      my.set(Math.max(-1, Math.min(1, ny)));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [reactive, reduce, mx, my]);

  return (
    <div ref={ref} data-state={state} className={`orb relative ${size} ${className}`} style={{ perspective: 900 }}>
      {/* halo ambiente */}
      <div aria-hidden className="orb-halo absolute -inset-[30%] rounded-full" />
      {/* ondas de escuta */}
      <div aria-hidden className="absolute inset-0">
        {[0, 1, 2].map((i) => (
          <span key={i} className="orb-wave absolute inset-[8%] rounded-full border border-electric/50" style={{ animationDelay: `${i * 0.6}s` }} />
        ))}
      </div>
      {/* órbita de partículas (pensando) */}
      <div aria-hidden className="orb-orbit absolute -inset-[6%]">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="absolute inset-0" style={{ transform: `rotate(${i * 36}deg)` }}>
            <span
              className="absolute left-1/2 top-0 -ml-[3px] block size-1.5 rounded-full"
              style={{
                background: i % 3 === 0 ? '#FFC400' : '#d8b4ff',
                boxShadow: `0 0 8px ${i % 3 === 0 ? '#FFC400' : '#a100ff'}`,
                opacity: 0.4 + (i % 4) * 0.15,
              }}
            />
          </span>
        ))}
      </div>

      <motion.div className="relative size-full" style={reactive ? { rotateX, rotateY, transformStyle: 'preserve-3d' } : undefined}>
        <div className="orb-body relative size-full">
          <div className="orb-float absolute inset-0">
          <Image
            src="/assets/maindy/orb/orb-original.png"
            alt=""
            fill
            sizes="(max-width: 768px) 70vw, 520px"
            priority={priority}
            className="orb-img object-contain"
          />
          </div>
          {/* reflexo que acompanha o cursor */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-[19%] rounded-full mix-blend-screen"
            style={{
              background: 'radial-gradient(circle at var(--gx) var(--gy), rgb(255 255 255 / 0.22), transparent 45%)',
              ['--gx' as string]: glowX,
              ['--gy' as string]: glowY,
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
