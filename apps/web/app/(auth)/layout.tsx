import Link from "next/link";
import type { Metadata } from "next";
import { Orb, Wordmark } from "@/components/brand";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-bg-deep">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-18%] h-[720px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(143,32,255,.22),rgba(143,32,255,.06)_55%,transparent)]" />
        <div className="absolute bottom-[-30%] left-[8%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(255,178,31,.06),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(5,4,23,.6))]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(190,183,214,.10)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      </div>
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="maindy. — página inicial" className="rounded-md">
          <Wordmark height={24} priority />
        </Link>
        <Link href="/precos" className="text-[13px] text-subtle transition-colors hover:text-fg">
          Planos e preços
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-12 pt-4">
        <div className="flex w-full max-w-[440px] flex-col items-center">
          <div className="relative mb-6">
            <div aria-hidden className="absolute inset-[-30%] rounded-full bg-[radial-gradient(closest-side,rgba(164,36,255,.35),transparent)] blur-xl" />
            <Orb size={72} priority className="relative" />
          </div>
          {children}
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-6 text-[12px] text-subtle">
        <Link href="/privacidade" className="hover:text-fg">Privacidade</Link>
        <Link href="/termos" className="hover:text-fg">Termos</Link>
        <Link href="/ajuda" className="hover:text-fg">Ajuda</Link>
        <span>© {new Date().getFullYear()} maindy.</span>
      </footer>
    </div>
  );
}
