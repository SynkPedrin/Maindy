import Image from 'next/image';
import Link from 'next/link';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Layout das telas de acesso: painel de marca (desktop) + formulário. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="noise relative hidden overflow-hidden border-r border-line bg-navy-2 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 top-1/3 size-[36rem] rounded-full bg-purple/30 blur-[140px]" />
          <div className="absolute -right-24 -top-24 size-[22rem] rounded-full bg-yellow/15 blur-[120px]" />
        </div>
        <Link href="/" className="relative z-10 w-fit" aria-label="MAINDY, voltar para a página inicial">
          <Image src="/assets/maindy/logo/maindy-logo.png" alt="MAINDY" width={168} height={48} priority />
        </Link>
        <div className="relative z-10 flex flex-col items-center gap-10">
          <div className="relative size-72 animate-float">
            <div aria-hidden className="absolute inset-6 animate-breathe rounded-full bg-electric/40 blur-3xl" />
            <Image
              src="/assets/maindy/orb/orb-idle.png"
              alt=""
              fill
              sizes="288px"
              className="object-contain drop-shadow-[0_30px_60px_rgb(121_0_255/0.45)]"
              priority
            />
          </div>
          <p className="max-w-sm text-center font-display text-2xl font-semibold leading-snug tracking-tight">
            Sua cabeça não precisa guardar tudo.
            <span className="block text-muted">A MAINDY lembra com você.</span>
          </p>
        </div>
        <p className="relative z-10 text-xs text-muted">© {new Date().getFullYear()} MAINDY</p>
      </aside>

      <main id="conteudo" className="relative flex flex-col px-4 py-8 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(121_0_255/0.18),transparent)] lg:hidden" />
        <Link href="/" className="relative z-10 mb-10 w-fit lg:hidden" aria-label="MAINDY, voltar para a página inicial">
          <Image src="/assets/maindy/logo/maindy-logo.png" alt="MAINDY" width={140} height={40} priority />
        </Link>
        <div className="relative z-10 mx-auto flex w-full max-w-[26rem] flex-1 flex-col justify-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.1rem]">{title}</h1>
          <p className="mt-2 text-[15px] text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
