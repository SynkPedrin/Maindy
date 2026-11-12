'use client';

import Image from 'next/image';
import { motion, useInView } from 'motion/react';
import { useEffect, useRef } from 'react';
import { SectionHeading } from './SectionHeading';
import { ease, revealViewport } from '@/lib/animations';
import { track } from '@/lib/analytics';

/* ---------- composições visuais próprias de cada recurso ---------- */
function MemoryArt() {
  return (
    <div aria-hidden className="relative h-56 sm:h-64">
      <div className="absolute -right-10 -top-16 h-[22rem] w-[30rem] max-w-none opacity-90 [mask-image:radial-gradient(closest-side,#000_55%,transparent)] sm:-right-4">
        <Image src="/assets/maindy/illustrations/memory-constellation.webp" alt="" fill sizes="480px" className="animate-[float_10s_ease-in-out_infinite] object-contain" />
      </div>
      {['Senha do Wi-Fi da casa da mãe', 'Livro que a Ana indicou', 'Chave reserva: gaveta do escritório'].map((t, i) => (
        <motion.div
          key={t}
          initial={{ opacity: 0, y: 20 }}
          viewport={{ once: true }} whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 * i, duration: 0.7, ease: ease.out }}
          className={`absolute left-0 max-w-[85%] rounded-2xl border border-line px-4 py-3 text-[13px] backdrop-blur-md ${i === 2 ? 'bg-purple/40 text-white' : 'bg-navy/60 text-muted'}`}
          style={{ top: 70 + i * 48, marginLeft: i * 12 }}
        >
          {t}
        </motion.div>
      ))}
    </div>
  );
}

function VoiceArt() {
  return (
    <div aria-hidden className="flex h-28 items-center justify-center gap-1">
      {Array.from({ length: 28 }).map((_, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-purple to-electric"
          animate={{ height: [6, 10 + Math.abs(Math.sin(i * 0.7)) * 56, 8] }}
          transition={{ duration: 1.2 + (i % 5) * 0.15, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function RemindersArt() {
  return (
    <div aria-hidden className="relative h-28">
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      {[
        { x: '12%', t: '08:00' },
        { x: '46%', t: 'Ao sair de casa' },
        { x: '82%', t: '19:30' },
      ].map((p, i) => (
        <motion.div key={p.t} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: p.x }} initial={{ scale: 0 }} viewport={{ once: true }} whileInView={{ scale: 1 }} transition={{ delay: i * 0.2, type: 'spring' }}>
          <span className={`block size-3 rounded-full ${i === 1 ? 'bg-yellow shadow-[0_0_14px_#ffc400]' : 'bg-electric'}`} />
          <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[11px] text-muted">{p.t}</span>
        </motion.div>
      ))}
    </div>
  );
}

function RoutineArt() {
  return (
    <ul aria-hidden className="flex flex-col gap-2.5">
      {['Remédio da manhã', 'Responder o e-mail do banco', 'Buscar as crianças'].map((t, i) => (
        <motion.li key={t} className="flex items-center gap-3 text-[13px]" initial={{ opacity: 0, x: -10 }} viewport={{ once: true }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.15 }}>
          <span className={`flex size-5 items-center justify-center rounded-md border ${i < 2 ? 'border-electric bg-electric' : 'border-white/25'}`}>
            {i < 2 && (
              <svg viewBox="0 0 16 16" className="size-3">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <span className={i < 2 ? 'text-muted line-through decoration-white/20' : 'text-white'}>{t}</span>
        </motion.li>
      ))}
    </ul>
  );
}

function FocusArt() {
  return (
    <div aria-hidden className="relative flex h-32 items-center justify-center">
      {[1, 0.72, 0.46].map((s, i) => (
        <motion.span
          key={s}
          className="absolute rounded-full border border-electric/40"
          style={{ width: `${s * 8}rem`, height: `${s * 8}rem` }}
          animate={{ scale: [1, 1.04, 1], opacity: [0.4 + i * 0.2, 0.9, 0.4 + i * 0.2] }}
          transition={{ duration: 4, repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
      <span className="font-display text-2xl font-semibold tabular-nums">25:00</span>
    </div>
  );
}

function AgentArt() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      {[
        { l: 'Tom', v: 0.7 },
        { l: 'Formalidade', v: 0.3 },
        { l: 'Detalhe', v: 0.55 },
      ].map((s, i) => (
        <div key={s.l} className="flex items-center gap-3 text-[12px] text-muted">
          <span className="w-20 shrink-0">{s.l}</span>
          <span className="relative h-1 flex-1 rounded-full bg-white/10">
            <motion.span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple to-electric" initial={{ width: 0 }} viewport={{ once: true }} whileInView={{ width: `${s.v * 100}%` }} transition={{ duration: 1, delay: i * 0.15, ease: ease.out }} />
          </span>
        </div>
      ))}
    </div>
  );
}

const features = [
  { key: 'memory', title: 'Memória inteligente', text: 'Registre informações e encontre respostas sobre aquilo que você já contou à MAINDY.', Art: MemoryArt, span: 'lg:col-span-7 lg:row-span-2' },
  { key: 'voice', title: 'Assistente por voz', text: 'Converse naturalmente com seu agente, sem precisar digitar tudo.', Art: VoiceArt, span: 'lg:col-span-5' },
  { key: 'reminders', title: 'Lembretes contextuais', text: 'Organize lembretes e receba notificações no momento adequado.', Art: RemindersArt, span: 'lg:col-span-5' },
  { key: 'routine', title: 'Organização de rotina', text: 'Gerencie tarefas, compromissos e responsabilidades em um só lugar.', Art: RoutineArt, span: 'lg:col-span-4' },
  { key: 'focus', title: 'Modo foco', text: 'Organize períodos de concentração e configure quais notificações merecem sua atenção.', Art: FocusArt, span: 'lg:col-span-4' },
  { key: 'agent', title: 'Agente personalizável', text: 'Configure nome, voz, personalidade, tom de comunicação e permissões do seu assistente.', Art: AgentArt, span: 'lg:col-span-4' },
];

export function Features() {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.25 });
  useEffect(() => {
    if (seen) track('feature_section_view');
  }, [seen]);

  return (
    <section ref={ref} id="recursos" aria-labelledby="recursos-title" className="section-y relative scroll-mt-16">
      <div className="container-x">
        <SectionHeading id="recursos-title" eyebrow="Recursos" title={<>Mais do que uma assistente. <span className="text-muted">Uma presença inteligente no seu cotidiano.</span></>} />
        <ul className="mt-16 grid gap-4 lg:mt-20 lg:grid-cols-12 lg:gap-5">
          {features.map(({ key, title, text, Art, span }, i) => (
            <motion.li
              key={key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={revealViewport}
              transition={{ duration: 0.8, ease: ease.out, delay: (i % 3) * 0.08 }}
              className={`group relative flex flex-col justify-between gap-8 overflow-hidden rounded-[var(--radius-card)] border border-line p-7 transition-colors duration-500 hover:border-white/20 sm:p-8 ${span} ${
                key === 'memory' ? 'bg-[radial-gradient(120%_80%_at_0%_0%,rgb(121_0_255/0.28),transparent_60%),linear-gradient(180deg,#0b1046,#080d38)]' : 'bg-navy-2/70'
              }`}
            >
              <Art />
              <div>
                <h3 className={`font-display font-semibold tracking-tight ${key === 'memory' ? 'text-3xl sm:text-4xl' : 'text-xl'}`}>{title}</h3>
                <p className={`mt-2 leading-relaxed text-muted ${key === 'memory' ? 'max-w-md text-base sm:text-lg' : 'text-[15px]'}`}>{text}</p>
              </div>
            </motion.li>
          ))}
        </ul>
        <p className="mt-6 text-center text-xs text-muted">Recursos em desenvolvimento. A disponibilidade de cada um será comunicada no lançamento.</p>
      </div>
    </section>
  );
}
