'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { SectionHeading } from './SectionHeading';
import { faqs } from './faq-data';
import { ease } from '@/lib/animations';
import { track } from '@/lib/analytics';

function Item({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="border-b border-line">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          onClick={() => {
            if (!open) track('faq_open', { index });
            setOpen((v) => !v);
          }}
          className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-lg font-medium tracking-tight transition-colors hover:text-white sm:text-xl"
        >
          {q}
          <span aria-hidden className="relative flex size-8 shrink-0 items-center justify-center rounded-full border border-line">
            <span className="absolute h-px w-3 bg-white" />
            <span className={`absolute h-3 w-px bg-white transition-transform duration-300 ${open ? 'rotate-90 opacity-0' : ''}`} />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            role="region"
            aria-labelledby={`${id}-btn`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: ease.out }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-6 text-[15.5px] leading-relaxed text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function FAQ() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="section-y relative scroll-mt-16">
      <div className="container-x grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading id="faq-title" align="left" eyebrow="FAQ" title="Perguntas frequentes" />
        <ul className="border-t border-line">
          {faqs.map((f, i) => (
            <Item key={f.q} q={f.q} a={f.a} index={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}
