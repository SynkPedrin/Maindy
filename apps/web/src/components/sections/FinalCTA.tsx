import { Orb } from '@/components/orb/Orb';
import { Reveal } from '@/components/motion/Reveal';
import { WaitlistForm } from './WaitlistForm';

export function FinalCTA() {
  return (
    <section id="acesso" aria-labelledby="acesso-title" className="noise relative scroll-mt-16 overflow-hidden bg-navy-2 py-[var(--section-y)]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 bottom-0 size-[40rem] rounded-full bg-purple/25 blur-[160px]" />
        <div className="absolute -right-20 top-0 size-[24rem] rounded-full bg-yellow/10 blur-[130px]" />
      </div>
      <div className="container-x relative grid items-center gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <Reveal className="text-center lg:text-left">
          <div className="mx-auto mb-10 w-fit lg:mx-0">
            <Orb size="size-40 sm:size-48" />
          </div>
          <h2 id="acesso-title" className="font-display text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-5xl">
            Você cuida da sua vida. <span className="text-gradient">Deixe a MAINDY ajudar com o resto.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg lg:mx-0">
            Entre para a lista de acesso antecipado e acompanhe o nascimento da sua segunda memória.
          </p>
          <p className="mt-6 text-sm text-white/80">Seja um dos primeiros a conhecer a MAINDY.</p>
        </Reveal>
        <Reveal className="glass relative rounded-[2rem] p-6 sm:p-9">
          <WaitlistForm />
        </Reveal>
      </div>
    </section>
  );
}
