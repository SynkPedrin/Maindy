'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Orb, type OrbState } from '@/components/orb/Orb';
import { SectionHeading } from './SectionHeading';
import { ease } from '@/lib/animations';
import { track } from '@/lib/analytics';

const LABELS: Record<OrbState, string> = {
  idle: 'Em espera',
  listening: 'Ouvindo',
  thinking: 'Pensando',
  responding: 'Respondendo',
};

const demoAnswers = [
  { q: 'Que horas é a consulta de amanhã?', a: 'Você anotou consulta com a Dra. Paula amanhã às 15h. Quer que eu avise uma hora antes?' },
  { q: 'O que eu precisava comprar?', a: 'Pão, café e pilhas para o controle. Você me pediu isso hoje de manhã.' },
  { q: 'Qual livro a Ana me indicou?', a: '“O Poder do Hábito”. Ela comentou na terça, durante o almoço.' },
];

export function InteractiveOrb() {
  const [state, setState] = useState<OrbState>('idle');
  const [open, setOpen] = useState(false);
  const [turn, setTurn] = useState<{ q: string; a: string } | null>(null);
  const [i, setI] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const holding = useRef(false);

  const clearAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearAll, []);

  const respond = useCallback(() => {
    const pick = demoAnswers[i % demoAnswers.length]!;
    setI((v) => v + 1);
    setOpen(true);
    setTurn({ q: pick.q, a: '' });
    setState('thinking');
    clearAll();
    timers.current.push(
      setTimeout(() => {
        setState('responding');
        setTurn(pick);
      }, 1500),
      setTimeout(() => setState('idle'), 4800),
    );
  }, [i]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    holding.current = false;
    holdTimer.current = setTimeout(() => {
      holding.current = true;
      clearAll();
      setState('listening');
      track('demo_interaction', { kind: 'hold' });
    }, 220);
  };
  const onPointerUp = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (holding.current) {
      holding.current = false;
      respond();
    }
  };
  const onClick = () => {
    if (state === 'listening') return;
    if (!open) {
      setOpen(true);
      track('demo_interaction', { kind: 'open' });
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) {
        setState('listening');
        holding.current = true;
      }
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if ((e.key === ' ' || e.key === 'Enter') && holding.current) {
      holding.current = false;
      respond();
    }
  };

  return (
    <section aria-labelledby="esfera-title" className="section-y relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_55%,rgb(121_0_255/0.22),transparent)]" />
      <div className="container-x flex flex-col items-center">
        <SectionHeading id="esfera-title" eyebrow="Experimente" title="Sempre que precisar, ela está por perto." subtitle="Toque na esfera para abrir uma conversa. Pressione e segure para ela ouvir. Solte para ver a resposta." />

        <div className="relative mt-14 flex flex-col items-center">
          <button
            type="button"
            aria-label="Esfera MAINDY de demonstração. Pressione e segure para simular a escuta."
            aria-describedby="esfera-status"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onClick}
            onKeyDown={onKey}
            onKeyUp={onKeyUp}
            onContextMenu={(e) => e.preventDefault()}
            className="relative touch-none select-none rounded-full [-webkit-touch-callout:none]"
          >
            <Orb state={state} reactive size="size-[min(72vw,320px)] sm:size-[400px]" />
          </button>

          <div id="esfera-status" aria-live="polite" className="mt-6 flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-4 py-1.5 text-xs text-muted">
            <span className={`size-1.5 rounded-full ${state === 'idle' ? 'bg-muted' : state === 'listening' ? 'animate-pulse bg-electric' : state === 'thinking' ? 'animate-pulse bg-yellow' : 'bg-success'}`} />
            {LABELS[state]}
          </div>

          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.5, ease: ease.out }}
                className="glass mt-6 w-[min(92vw,26rem)] rounded-3xl p-5"
                role="dialog"
                aria-label="Conversa de demonstração"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Simulação visual · sem microfone</span>
                  <button type="button" onClick={() => { setOpen(false); setTurn(null); clearAll(); setState('idle'); }} className="rounded-full px-2 py-1 text-xs text-muted hover:text-white">
                    Fechar
                  </button>
                </div>
                {!turn ? (
                  <p className="mt-4 text-sm text-white/90">Oi! Pressione e segure a esfera e “fale” comigo. Esta é uma demonstração: nada é gravado.</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-3 text-sm">
                    <p className="self-end rounded-2xl rounded-br-md bg-purple px-4 py-2.5">{turn.q}</p>
                    {turn.a ? (
                      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="self-start rounded-2xl rounded-bl-md border border-line bg-white/[0.06] px-4 py-2.5 text-white/95">
                        {turn.a}
                      </motion.p>
                    ) : (
                      <p className="self-start text-xs text-muted">Procurando na sua memória…</p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
