'use client';

import Image from 'next/image';
import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { Reveal } from '@/components/motion/Reveal';
import { ease } from '@/lib/animations';

/** Nossa visão: manifesto + arte-chave original da marca (o vídeo da marca abre a página, na hero). */
export function Vision() {
  const frameRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ['start end', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1.12, 1]);

  return (
    <section id="visao" aria-labelledby="visao-title" className="section-y relative scroll-mt-16">
      <div className="container-x">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, filter: 'blur(12px)' }}
          whileInView={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 1.2, ease: ease.out }}
          className="relative overflow-hidden rounded-[2rem] border border-line shadow-[0_60px_140px_-40px_rgb(121_0_255/0.5)]"
        >
          <div ref={frameRef} className="relative aspect-video w-full overflow-hidden">
            <motion.div style={{ scale }} className="absolute inset-0">
              <Image
                src="/assets/maindy/backgrounds/maindy-key-visual.png"
                alt="Marca MAINDY sobre fundo azul-marinho com arcos de luz roxa e amarela"
                fill
                sizes="(max-width: 1280px) 92vw, 1200px"
                className="object-cover"
              />
            </motion.div>
          </div>
        </motion.div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-10 lg:grid-cols-[auto_1fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow">Nossa visão</p>
            <h2 id="visao-title" className="mt-4 max-w-sm font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Uma IA que cuida da sua memória, não da sua atenção.
            </h2>
          </Reveal>
          <Reveal className="flex flex-col gap-5 text-base leading-relaxed text-muted sm:text-lg">
            <p>
              A maior parte da tecnologia disputa seu tempo. A MAINDY existe para devolvê-lo. Ela guarda o que você não
              quer esquecer e devolve no momento em que você precisa, sem barulho.
            </p>
            <p>
              Ela não foi feita só para responder perguntas. Ela ajuda você a lembrar e organizar a própria vida, para
              qualquer pessoa: quem tem TDAH, quem esquece com frequência, quem vive sobrecarregado ou simplesmente
              quem quer pensar com mais leveza.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
