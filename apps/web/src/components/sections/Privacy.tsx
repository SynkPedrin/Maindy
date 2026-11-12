'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { ease, revealViewport } from '@/lib/animations';

const points = [
  { t: 'Memória individual', d: 'Cada pessoa tem um espaço de memória separado dos demais usuários.' },
  { t: 'Controle de acesso', d: 'Somente você, autenticado, acessa o que registrou.' },
  { t: 'Permissões configuráveis', d: 'Você decide o que a MAINDY pode acessar no seu aparelho, e pode mudar quando quiser.' },
  { t: 'Transparência', d: 'Você poderá ver o que está armazenado e pedir a remoção a qualquer momento.' },
  { t: 'Controle sobre integrações', d: 'Integrações só são ativadas com a sua autorização explícita.' },
];

export function Privacy() {
  return (
    <section aria-labelledby="privacidade-title" className="section-y relative overflow-hidden">
      <div className="container-x grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeading
            id="privacidade-title"
            align="left"
            eyebrow="Privacidade e confiança"
            title="Sua memória é pessoal. Seu controle também."
            subtitle="A MAINDY está sendo desenvolvida com uma arquitetura de memória individualizada, controle de permissões e separação dos dados de cada usuário."
          />
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={revealViewport}
            transition={{ duration: 1.2, ease: ease.out }}
            className="relative mx-auto mt-10 h-56 max-w-md sm:h-72 lg:mx-0"
          >
            <Image
              src="/assets/maindy/illustrations/privacy-vault.webp"
              alt=""
              fill
              sizes="(max-width: 1024px) 92vw, 520px"
              className="animate-[float_9s_ease-in-out_infinite] object-contain [mask-image:radial-gradient(closest-side,#000_60%,transparent)]"
            />
          </motion.div>
        </div>

        <ul className="flex flex-col">
          {points.map((p, i) => (
            <motion.li
              key={p.t}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={revealViewport}
              transition={{ duration: 0.7, ease: ease.out, delay: i * 0.06 }}
              className="flex gap-5 border-b border-line py-7 first:pt-0"
            >
              <span aria-hidden className="mt-1 font-display text-sm text-electric">
                0{i + 1}
              </span>
              <div>
                <h3 className="font-display text-xl font-semibold tracking-tight">{p.t}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{p.d}</p>
              </div>
            </motion.li>
          ))}
          <li className="pt-6 text-xs text-muted">
            Descrevemos a arquitetura em desenvolvimento. Não há, até aqui, certificações ou auditorias externas concluídas.
          </li>
        </ul>
      </div>
    </section>
  );
}
