'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { SectionHeading } from './SectionHeading';
import { track } from '@/lib/analytics';

const styles = { direta: 'Direta', acolhedora: 'Acolhedora', detalhista: 'Detalhista' } as const;
const tones = { calmo: 'Calmo', animado: 'Animado', neutro: 'Neutro' } as const;
const personalities = { parceira: 'Parceira', organizada: 'Organizada', divertida: 'Divertida' } as const;
type Style = keyof typeof styles;
type Tone = keyof typeof tones;
type Personality = keyof typeof personalities;

function preview(name: string, style: Style, tone: Tone, p: Personality): string {
  const open = { calmo: 'Tudo certo.', animado: 'Bom dia!', neutro: 'Olá.' }[tone];
  const intro = { parceira: `Aqui é ${name}, estou com você.`, organizada: `${name} aqui, com tudo em ordem.`, divertida: `${name} na área!` }[p];
  const body = {
    direta: 'Hoje: consulta às 15h e pagar a conta de luz.',
    acolhedora: 'Hoje você tem a consulta às 15h e a conta de luz para pagar. Sem pressa, eu te lembro na hora certa.',
    detalhista: 'Hoje: consulta às 15h com a Dra. Paula (leve os exames) e conta de luz, que vence às 23h59.',
  }[style];
  return `${open} ${intro} ${body}`;
}

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-white/90">{label}</legend>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((k) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name={label} value={k} checked={value === k} onChange={() => onChange(k)} className="peer sr-only" />
            <span className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm text-muted transition-all duration-200 hover:border-white/25 hover:text-white peer-checked:border-electric peer-checked:bg-electric/15 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-yellow">
              {options[k]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Personalization() {
  const [name, setName] = useState('Mindy');
  const [style, setStyle] = useState<Style>('acolhedora');
  const [tone, setTone] = useState<Tone>('calmo');
  const [personality, setPersonality] = useState<Personality>('parceira');
  const safeName = name.trim().slice(0, 20) || 'MAINDY';
  const text = useMemo(() => preview(safeName, style, tone, personality), [safeName, style, tone, personality]);
  const touched = () => track('demo_interaction', { kind: 'personalization' });

  return (
    <section aria-labelledby="perso-title" className="section-y relative">
      <div className="container-x grid items-center gap-14 lg:grid-cols-[1fr_1.1fr]">
        <SectionHeading id="perso-title" align="left" eyebrow="Personalização" title="A sua MAINDY. Do seu jeito." subtitle="Escolha como seu agente fala com você. Experimente abaixo: nada do que você digitar aqui é salvo ou enviado." />

        <div className="glass grid gap-7 rounded-[var(--radius-card)] p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="agent-name" className="text-sm font-medium text-white/90">
              Nome do agente
            </label>
            <input
              id="agent-name"
              value={name}
              maxLength={20}
              autoComplete="off"
              onChange={(e) => { setName(e.target.value); touched(); }}
              className="h-12 rounded-2xl border border-line bg-white/[0.03] px-4 text-[15px] focus:border-electric focus:outline-none focus:shadow-[0_0_0_4px_rgb(161_0_255/0.18)]"
            />
          </div>
          <Chips label="Estilo de comunicação" options={styles} value={style} onChange={(v) => { setStyle(v); touched(); }} />
          <Chips label="Tom de voz" options={tones} value={tone} onChange={(v) => { setTone(v); touched(); }} />
          <Chips label="Personalidade" options={personalities} value={personality} onChange={(v) => { setPersonality(v); touched(); }} />

          <div className="rounded-2xl border border-line bg-navy/60 p-5">
            <div className="flex items-center gap-2.5">
              <Image src="/assets/maindy/logo/maindy-symbol.png" alt="" width={28} height={28} className="size-7" />
              <span className="text-sm font-semibold">{safeName}</span>
              <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-muted">Prévia</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={text} initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.3 }} className="mt-3 text-[15px] leading-relaxed text-white/90" aria-live="polite">
                {text}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
