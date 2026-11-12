'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { ease, revealViewport } from '@/lib/animations';

const thoughts = [
  { n: '01', q: 'Onde eu deixei minha chave?', fragments: ['gaveta?', 'carro?', 'bolsa?'], img: 'problem-keys' },
  { n: '02', q: 'O que aquela pessoa tinha me falado?', fragments: ['terça…', 'o nome dela', 'um livro'], img: 'problem-conversation' },
  { n: '03', q: 'Eu tinha um compromisso hoje?', fragments: ['15h?', 'dentista', 'reunião'], img: 'problem-calendar' },
  { n: '04', q: 'O que mesmo eu precisava fazer?', fragments: ['pagar…', 'ligar', 'comprar'], img: 'problem-tasks' },
];

/** Fragmentos de pensamento que aparecem e somem, como lembranças que escapam. */
function Fragments({ items, seed }: { items: string[]; seed: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((t, i) => (
        <motion.span
          key={t}
          className="absolute rounded-full border border-line bg-white/[0.03] px-3 py-1 text-[11px] text-muted"
          style={{ left: `${12 + ((i * 31 + seed * 17) % 62)}%`, top: `${14 + ((i * 23 + seed * 11) % 46)}%` }}
          animate={{ opacity: [0, 0.9, 0.9, 0], y: [8, 0, -4, -14], filter: ['blur(4px)', 'blur(0px)', 'blur(0px)', 'blur(6px)'] }}
          transition={{ duration: 5.5, times: [0, 0.2, 0.7, 1], repeat: Infinity, delay: i * 1.6 + seed * 0.7, ease: 'easeInOut' }}
        >
          {t}
        </motion.span>
      ))}
    </div>
  );
}

export function Problem() {
  return (
    <section id="dor" aria-labelledby="dor-title" className="section-y relative">
      <div className="container-x">
        <SectionHeading
          id="dor-title"
          title="Quantas coisas você tenta lembrar todos os dias?"
          subtitle="Nem tudo precisa ocupar espaço na sua cabeça."
        />
        <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:mt-20 lg:gap-5">
          {thoughts.map((t, i) => (
            <motion.li
              key={t.n}
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              viewport={revealViewport}
              transition={{ duration: 0.9, ease: ease.out, delay: (i % 2) * 0.12 }}
              className={`group relative flex min-h-80 flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-line bg-navy p-7 sm:min-h-96 sm:p-9 ${
                i % 2 === 1 ? 'lg:translate-y-12' : ''
              }`}
            >
              <div aria-hidden className="absolute inset-0 [mask-image:radial-gradient(75%_75%_at_50%_32%,#000_45%,transparent_80%)]">
                <Image
                  src={`/assets/maindy/illustrations/${t.img}.webp`}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 92vw, 560px"
                  className="object-cover object-[50%_20%] transition-transform duration-[1.4s] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]"
                />
              </div>
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-navy" />
              <Fragments items={t.fragments} seed={i} />
              <span aria-hidden className="absolute right-7 top-6 font-display text-sm text-muted/60">
                {t.n}
              </span>
              <p className="relative font-display text-2xl font-medium leading-snug tracking-tight sm:text-[1.75rem]">“{t.q}”</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
