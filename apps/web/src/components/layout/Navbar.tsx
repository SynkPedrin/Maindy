'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { ease } from '@/lib/animations';

const links = [
  { href: '#como-funciona', label: 'Como funciona' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#visao', label: 'Nossa visão' },
  { href: '#faq', label: 'FAQ' },
];

export function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: ease.out, delay: 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        scrolled || open ? 'border-b border-line bg-navy/70 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav aria-label="Principal" className="container-x flex h-16 items-center justify-between gap-6 md:h-[72px]">
        <Link href="/" aria-label="MAINDY, início" className="shrink-0">
          <Image src="/assets/maindy/logo/maindy-logo.png" alt="MAINDY" width={132} height={38} priority className="h-8 w-auto md:h-9" />
        </Link>

        <ul className="hidden items-center gap-8 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="text-sm text-muted transition-colors hover:text-white">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/entrar" className="px-3 text-sm font-medium text-white/85 transition-colors hover:text-white">
            Entrar
          </Link>
          <ButtonLink href="#acesso" size="md">
            Acesso antecipado
          </ButtonLink>
        </div>

        <button
          type="button"
          className="relative flex size-11 items-center justify-center rounded-full lg:hidden"
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`absolute h-0.5 w-5 rounded bg-white transition-transform duration-300 ${open ? 'rotate-45' : '-translate-y-1.5'}`} />
          <span className={`absolute h-0.5 w-5 rounded bg-white transition-opacity duration-200 ${open ? 'opacity-0' : ''}`} />
          <span className={`absolute h-0.5 w-5 rounded bg-white transition-transform duration-300 ${open ? '-rotate-45' : 'translate-y-1.5'}`} />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="menu-mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'calc(100dvh - 64px)' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4, ease: ease.out }}
            className="overflow-hidden lg:hidden"
          >
            <div className="container-x flex h-full flex-col justify-between pb-10 pt-6">
              <ul className="flex flex-col">
                {links.map((l, i) => (
                  <motion.li key={l.href} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1 }}>
                    <a href={l.href} onClick={() => setOpen(false)} className="block border-b border-line py-5 font-display text-2xl font-semibold">
                      {l.label}
                    </a>
                  </motion.li>
                ))}
              </ul>
              <div className="flex flex-col gap-3">
                <ButtonLink href="#acesso" size="lg" onClick={() => setOpen(false)}>
                  Acesso antecipado
                </ButtonLink>
                <ButtonLink href="/entrar" variant="secondary" size="lg">
                  Entrar
                </ButtonLink>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
