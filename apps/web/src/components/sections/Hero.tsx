'use client';

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Magnetic } from '@/components/motion/MagneticButton';
import { ButtonLink } from '@/components/ui/Button';
import { ease } from '@/lib/animations';
import { track } from '@/lib/analytics';

const MEDIA = '/assets/maindy/animations';
/** Momento da intro (Remotion, cena 6) em que a composição abre espaço para o texto. */
const REVEAL_AT = 5.4;

type Phase = 'intro' | 'loop' | 'static';

const line = {
  hidden: { opacity: 0, y: 24, filter: 'blur(10px)' },
  show: (i: number) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: ease.out, delay: i * 0.12 } }),
};

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const intro = useRef<HTMLVideoElement>(null);
  const loop = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('intro');
  const [revealed, setRevealed] = useState(false);

  // scroll: a cena aproxima e escurece levemente
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const mediaScale = useTransform(scrollYProgress, [0, 1], [1, 1.12]);
  const mediaOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.25]);
  const textY = useTransform(scrollYProgress, [0, 1], ['0%', '-30%']);

  // brilho que segue o cursor (desktop)
  const mx = useSpring(useMotionValue(50), { stiffness: 60, damping: 20 });
  const my = useSpring(useMotionValue(40), { stiffness: 60, damping: 20 });
  const glow = useTransform([mx, my], ([x, y]) => `radial-gradient(28rem 28rem at ${x}% ${y}%, rgb(161 0 255 / 0.18), transparent 70%)`);

  useEffect(() => {
    if (reduce) {
      setPhase('static');
      setRevealed(true);
      return;
    }
    const v = intro.current;
    if (!v) return;
    const fallback = setTimeout(() => setRevealed(true), (REVEAL_AT + 1.5) * 1000);
    v.play().catch(() => {
      // autoplay bloqueado (ex.: modo economia no iOS): mostra a cena final estática
      setPhase('static');
      setRevealed(true);
    });
    const onTime = () => v.currentTime >= REVEAL_AT && setRevealed(true);
    const onScroll = () => window.scrollY > 40 && setRevealed(true);
    v.addEventListener('timeupdate', onTime);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(fallback);
      v.removeEventListener('timeupdate', onTime);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduce]);

  const onIntroEnd = () => {
    // o último quadro da intro é idêntico ao primeiro do loop (renderizados juntos no Remotion)
    const l = loop.current;
    if (!l) return setPhase('static');
    l.currentTime = 0;
    l.play().then(() => setPhase('loop')).catch(() => setPhase('static'));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

  // mobile: cobre uma caixa no topo; desktop: escala pela altura (a esfera mantém proporção com a tela)
  const videoClass =
    'absolute inset-0 size-full object-cover transition-opacity duration-300 md:inset-auto md:left-1/2 md:top-0 md:h-[84svh] md:w-auto md:max-w-none md:-translate-x-1/2';

  return (
    <section
      ref={ref}
      onPointerMove={onPointerMove}
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden bg-navy"
    >
      {/* mídia: intro Remotion -> loop da esfera */}
      <motion.div aria-hidden style={{ scale: mediaScale, opacity: mediaOpacity }} className="absolute inset-x-0 top-0 -z-10 h-[min(135vw,560px)] md:inset-0 md:h-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${MEDIA}/hero-poster.jpeg`} alt="" className={`${videoClass} ${phase === 'static' ? 'opacity-100' : 'opacity-0'}`} />
        {!reduce && (
          <>
            <video ref={intro} muted playsInline preload="auto" onEnded={onIntroEnd} className={`${videoClass} ${phase === 'intro' ? 'opacity-100' : 'opacity-0'}`}>
              <source src={`${MEDIA}/maindy-intro-1080.mp4`} type="video/mp4" />
            </video>
            <video ref={loop} muted playsInline loop preload="auto" className={`${videoClass} ${phase === 'loop' ? 'opacity-100' : 'opacity-0'}`}>
              <source src={`${MEDIA}/orb-loop-1080.mp4`} type="video/mp4" />
            </video>
          </>
        )}
        <motion.div className="absolute inset-0 hidden mix-blend-screen md:block" style={{ background: glow }} />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-navy" />
      </motion.div>

      <motion.div style={{ y: textY }} className="container-x relative pb-12 pt-[min(90vw,352px)] text-center md:pb-[clamp(2.5rem,7vh,5rem)] md:pt-0">
        <motion.p custom={0} variants={line} initial="hidden" animate={revealed ? 'show' : 'hidden'} className="eyebrow">
          Sua segunda memória. Sempre por perto.
        </motion.p>
        <motion.h1
          id="hero-title"
          custom={1}
          variants={line}
          initial="hidden"
          animate={revealed ? 'show' : 'hidden'}
          className="mx-auto mt-4 max-w-4xl font-display text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[clamp(3rem,6.2vh,4.4rem)]"
        >
          Sua cabeça não precisa <span className="text-gradient">guardar tudo.</span>
        </motion.h1>
        <motion.p custom={2} variants={line} initial="hidden" animate={revealed ? 'show' : 'hidden'} className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Uma inteligência artificial que ajuda você a lembrar, organizar e recuperar aquilo que realmente importa. Sua
          segunda memória, sempre por perto.
        </motion.p>
        <motion.div custom={3} variants={line} initial="hidden" animate={revealed ? 'show' : 'hidden'} className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Magnetic className="w-full sm:w-auto">
            <ButtonLink href="#acesso" size="lg" onClick={() => track('hero_cta_click', { cta: 'primary' })} className="w-full sm:w-auto">
              Quero conhecer a MAINDY
            </ButtonLink>
          </Magnetic>
          <ButtonLink href="#como-funciona" variant="secondary" size="lg" onClick={() => track('hero_cta_click', { cta: 'secondary' })} className="w-full sm:w-auto">
            Veja como funciona
          </ButtonLink>
        </motion.div>
        <motion.p custom={4} variants={line} initial="hidden" animate={revealed ? 'show' : 'hidden'} className="mt-5 flex items-center justify-center gap-2 text-[13px] text-muted">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-yellow shadow-[0_0_10px_#ffc400]" />
          Uma nova forma de organizar sua vida está chegando.
        </motion.p>
      </motion.div>
    </section>
  );
}
