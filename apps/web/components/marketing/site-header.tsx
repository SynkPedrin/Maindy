"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Orb, Wordmark } from "@/components/brand";
import { cn } from "@/lib/cn";
import { nav } from "./content";
import { Magnetic } from "./motion";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out-expo",
        scrolled || open
          ? "border-b border-line bg-bg/72 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1360px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
        <Link href="/" aria-label="maindy. — página inicial" className="flex shrink-0 items-center gap-2.5 rounded-full">
          <Orb size={30} priority />
          <Wordmark height={19} priority className="translate-y-[1px]" />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-[14px] text-muted transition-colors duration-200 hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="rounded-full px-3.5 py-2 text-[14px] text-muted transition-colors hover:text-fg">
            Login
          </Link>
          <Magnetic strength={0.18}>
            <Link
              href="/cadastro"
              className="group inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4.5 text-[14px] font-medium text-bg shadow-[0_8px_30px_-10px_rgba(164,36,255,.8)] transition-shadow duration-200 hover:shadow-[0_10px_40px_-8px_rgba(199,36,255,.95)]"
            >
              Começar a economizar
              <ArrowRight aria-hidden className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Magnetic>
        </div>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-fg lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-bg-deep/80 backdrop-blur-sm data-[state=open]:animate-[mk-fade_.25s_ease-out]" />
            <Dialog.Content className="fixed inset-x-0 top-0 z-[70] flex max-h-dvh flex-col overflow-y-auto border-b border-line bg-bg px-5 pb-8 sm:px-8 data-[state=open]:animate-[mk-fade_.3s_cubic-bezier(.16,1,.3,1)]">
              <Dialog.Title className="sr-only">Menu</Dialog.Title>
              <Dialog.Description className="sr-only">Navegação principal do site maindy.</Dialog.Description>
              <div className="flex h-16 items-center justify-between">
                <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5" aria-label="maindy. — página inicial">
                  <Orb size={30} />
                  <Wordmark height={19} />
                </Link>
                <Dialog.Close className="-mr-2 inline-flex size-11 items-center justify-center rounded-full" aria-label="Fechar menu">
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>
              <nav aria-label="Principal (móvel)" className="mt-6 flex flex-col">
                {[...nav, { label: "Metodologia", href: "/metodologia" }, { label: "Ajuda", href: "/ajuda" }].map((item, i) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline justify-between border-b border-line py-4 text-[28px] font-medium tracking-[-0.03em] text-fg"
                  >
                    {item.label}
                    <span className="font-mono text-[11px] tracking-[0.14em] text-subtle">{String(i + 1).padStart(2, "0")}</span>
                  </Link>
                ))}
              </nav>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-line-strong text-[15px]"
                >
                  Login
                </Link>
                <Link
                  href="/cadastro"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-fg text-[15px] font-medium text-bg"
                >
                  Começar
                </Link>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
