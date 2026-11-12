import Image from 'next/image';
import Link from 'next/link';

export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-navy">
      <header className="container-x flex h-20 items-center">
        <Link href="/" aria-label="MAINDY, página inicial">
          <Image src="/assets/maindy/logo/maindy-logo.png" alt="MAINDY" width={140} height={40} />
        </Link>
      </header>
      <main id="conteudo" className="container-x pb-24 pt-8">
        <article className="mx-auto max-w-2xl text-[15.5px] leading-relaxed text-muted [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-2 [&_p]:mt-4 [&_strong]:text-white [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <p className="eyebrow !mt-0">Versão {version}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white">{title}</h1>
          {children}
        </article>
      </main>
    </div>
  );
}
