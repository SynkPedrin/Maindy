'use client';

import { motion, useScroll, useSpring } from 'motion/react';
import { useRef } from 'react';
import { SectionHeading } from './SectionHeading';
import { ease, revealViewport } from '@/lib/animations';

/** Composições gráficas próprias de cada etapa (SVG, sem ícones genéricos). */
function TellVisual() {
  return (
    <svg viewBox="0 0 160 100" className="h-24 w-full" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => {
        const h = 10 + Math.abs(Math.sin(i * 0.9)) * 46;
        return (
          <motion.rect
            key={i}
            x={12 + i * 7.6}
            width="3.6"
            rx="1.8"
            fill={i % 6 === 0 ? '#FFC400' : '#a100ff'}
            initial={{ height: 4, y: 48 }}
            viewport={{ once: true }} whileInView={{ height: [h * 0.4, h, h * 0.6], y: [50 - h * 0.2, 50 - h / 2, 50 - h * 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatType: 'mirror', delay: i * 0.05 }}
          />
        );
      })}
    </svg>
  );
}

function OrganizeVisual() {
  const nodes = [
    [30, 30], [80, 18], [130, 34], [52, 72], [108, 76], [80, 50],
  ] as const;
  return (
    <svg viewBox="0 0 160 100" className="h-24 w-full" aria-hidden>
      {nodes.slice(0, 5).map(([x, y], i) => (
        <motion.line key={i} x1={80} y1={50} x2={x} y2={y} stroke="#a100ff" strokeOpacity="0.5" strokeWidth="1" initial={{ pathLength: 0 }} viewport={{ once: true }} whileInView={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.2 + i * 0.12 }} />
      ))}
      {nodes.map(([x, y], i) => (
        <motion.circle key={i} cx={x} cy={y} r={i === 5 ? 7 : 4} fill={i === 5 ? '#FFC400' : '#d8b4ff'} initial={{ scale: 0 }} viewport={{ once: true }} whileInView={{ scale: 1 }} transition={{ delay: i * 0.1, type: 'spring' }} />
      ))}
    </svg>
  );
}

function RecallVisual() {
  return (
    <svg viewBox="0 0 160 100" className="h-24 w-full" aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={20} y={18 + i * 24} width={120} height={16} rx={8} fill="white" fillOpacity={i === 1 ? 0 : 0.06} />
      ))}
      <motion.rect x={20} y={42} width={120} height={16} rx={8} fill="#7900ff" initial={{ opacity: 0, scaleX: 0.3 }} viewport={{ once: true }} whileInView={{ opacity: 1, scaleX: 1 }} style={{ transformOrigin: '20px 50px' }} transition={{ duration: 0.9, ease: ease.out, delay: 0.3 }} />
      <motion.circle cx={128} cy={50} r={4} fill="#FFC400" initial={{ opacity: 0 }} viewport={{ once: true }} whileInView={{ opacity: 1 }} transition={{ delay: 1 }} />
    </svg>
  );
}

const steps = [
  { n: '01', title: 'Você conta', text: 'Fale ou escreva. Registre pensamentos, informações, compromissos e pequenas responsabilidades.', Visual: TellVisual },
  { n: '02', title: 'A MAINDY organiza', text: 'A inteligência artificial transforma suas informações em memórias estruturadas e pesquisáveis.', Visual: OrganizeVisual },
  { n: '03', title: 'Você recupera', text: 'Quando precisar, pergunte. A MAINDY ajuda você a encontrar o que já registrou.', Visual: RecallVisual },
];

export function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 22 });

  return (
    <section id="como-funciona" aria-labelledby="como-title" className="section-y relative scroll-mt-16">
      <div className="container-x">
        <SectionHeading id="como-title" eyebrow="Como funciona" title="Simples de usar. Inteligente para lembrar." />
        <ol ref={ref} className="relative mt-16 grid gap-6 lg:mt-24 lg:grid-cols-3 lg:gap-8">
          {/* linha conectora que avança com o scroll */}
          <div aria-hidden className="absolute bottom-0 left-[27px] top-0 w-px bg-white/10 lg:bottom-auto lg:left-0 lg:right-0 lg:top-[27px] lg:h-px lg:w-auto">
            <motion.div style={{ scaleY: progress }} className="absolute inset-0 origin-top bg-gradient-to-b from-electric via-purple to-yellow lg:hidden" />
            <motion.div style={{ scaleX: progress }} className="absolute inset-0 hidden origin-left bg-gradient-to-r from-electric via-purple to-yellow lg:block" />
          </div>
          {steps.map(({ n, title, text, Visual }, i) => (
            <motion.li
              key={n}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={revealViewport}
              transition={{ duration: 0.8, ease: ease.out, delay: i * 0.12 }}
              className="relative pl-16 lg:pl-0 lg:pt-16"
            >
              <span className="absolute left-0 top-0 flex size-14 items-center justify-center rounded-full border border-line bg-navy font-display text-sm font-semibold text-white shadow-[0_0_0_6px_var(--color-navy)]">
                {n}
              </span>
              <div className="glass rounded-[var(--radius-card)] p-6 sm:p-7">
                <Visual />
                <h3 className="mt-5 font-display text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
