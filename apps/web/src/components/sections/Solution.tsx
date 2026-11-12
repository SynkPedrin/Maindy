'use client';

import Image from 'next/image';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SectionHeading } from './SectionHeading';
import { ease } from '@/lib/animations';

type Msg = { from: 'user' | 'maindy' | 'note'; text: string };

const script: Msg[] = [
  { from: 'user', text: 'Minha chave reserva está na gaveta do escritório.' },
  { from: 'maindy', text: 'Pode deixar. Vou guardar essa informação para você.' },
  { from: 'note', text: 'Informação salva na sua memória pessoal.' },
  { from: 'user', text: 'Onde está minha chave reserva?' },
  { from: 'maindy', text: 'Você me contou que ela está na gaveta do escritório.' },
];

function Bubble({ m }: { m: Msg }) {
  if (m.from === 'note') {
    return (
      <div className="mx-auto flex items-center gap-2 rounded-full border border-yellow/30 bg-yellow/10 px-3 py-1.5 text-[11.5px] text-yellow">
        <span aria-hidden className="size-1.5 rounded-full bg-yellow" />
        {m.text}
      </div>
    );
  }
  const mine = m.from === 'user';
  return (
    <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && <Image src="/assets/maindy/logo/maindy-symbol.png" alt="" width={24} height={24} className="mb-0.5 size-6" />}
      <p
        className={`max-w-[78%] rounded-[1.25rem] px-4 py-2.5 text-[13.5px] leading-snug ${
          mine ? 'rounded-br-md bg-purple text-white' : 'rounded-bl-md border border-line bg-white/[0.06] text-white/95'
        }`}
      >
        {m.text}
      </p>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-2">
      <Image src="/assets/maindy/logo/maindy-symbol.png" alt="" width={24} height={24} className="size-6" />
      <div className="flex gap-1 rounded-[1.25rem] rounded-bl-md border border-line bg-white/[0.06] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-white/70" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </div>
    </div>
  );
}

export function Solution() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-20% 0px' });
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setCount(script.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 400;
    setCount(0);
    script.forEach((m, i) => {
      if (m.from === 'maindy') {
        timers.push(setTimeout(() => setTyping(true), t));
        t += 1100;
      }
      timers.push(
        setTimeout(() => {
          setTyping(false);
          setCount(i + 1);
        }, t),
      );
      t += m.from === 'note' ? 1400 : 1000;
    });
    // reinicia a conversa após uma pausa
    timers.push(setTimeout(() => setCycle((c) => c + 1), t + 3500));
    return () => timers.forEach(clearTimeout);
  }, [inView, cycle]);

  return (
    <section aria-labelledby="solucao-title" className="section-y relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple/15 blur-[160px]" />
      <div className="container-x grid items-center gap-16 lg:grid-cols-2">
        <SectionHeading
          id="solucao-title"
          align="left"
          eyebrow="A solução"
          title="Conheça sua segunda memória."
          subtitle="A MAINDY transforma informações dispersas em lembranças organizadas e acessíveis. Você conversa, registra e recupera informações de maneira natural."
        />

        <div ref={ref} className="relative mx-auto w-full max-w-[340px]">
          <motion.div
            initial={{ opacity: 0, y: 60, rotate: -2 }}
            whileInView={{ opacity: 1, y: 0, rotate: 0 }}
            viewport={{ once: true, margin: '-10% 0px' }}
            transition={{ duration: 1.1, ease: ease.out }}
            className="relative rounded-[2.8rem] border border-white/15 bg-[#04061f] p-2.5 shadow-[0_60px_120px_-30px_rgb(121_0_255/0.55),inset_0_0_0_1px_rgb(255_255_255/0.04)]"
          >
            <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[2.3rem] bg-[linear-gradient(180deg,#080d38,#05082b)]">
              <div aria-hidden className="mx-auto mt-2.5 h-6 w-24 rounded-full bg-black" />
              <div className="flex items-center gap-3 border-b border-line px-5 pb-3 pt-4">
                <Image src="/assets/maindy/logo/maindy-symbol.png" alt="" width={32} height={32} className="size-8" />
                <div>
                  <p className="text-sm font-semibold">MAINDY</p>
                  <p className="text-[11px] text-muted">sua segunda memória</p>
                </div>
                <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">Demonstração</span>
              </div>
              <div className="flex flex-1 flex-col justify-end gap-3 px-4 pb-5" aria-live="polite">
                <AnimatePresence initial={false}>
                  {script.slice(0, count).map((m, i) => (
                    <motion.div key={i} layout initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: ease.out }}>
                      <Bubble m={m} />
                    </motion.div>
                  ))}
                  {typing && (
                    <motion.div key="typing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <Typing />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="mx-4 mb-5 flex h-11 items-center rounded-full border border-line bg-white/[0.04] px-4 text-[12.5px] text-muted">
                Conte algo para a MAINDY…
              </div>
            </div>
          </motion.div>
          <p className="mt-5 text-center text-xs text-muted">Simulação ilustrativa da interface. Não está conectada à IA.</p>
        </div>
      </div>
    </section>
  );
}
