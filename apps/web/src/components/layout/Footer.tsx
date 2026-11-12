import Image from 'next/image';
import Link from 'next/link';

const groups = [
  {
    title: 'Produto',
    links: [
      { href: '#como-funciona', label: 'Como funciona' },
      { href: '#recursos', label: 'Recursos' },
      { href: '#faq', label: 'Perguntas frequentes' },
    ],
  },
  {
    title: 'Conta',
    links: [
      { href: '/entrar', label: 'Entrar' },
      { href: '/cadastro', label: 'Criar conta' },
      { href: '#acesso', label: 'Acesso antecipado' },
    ],
  },
  {
    title: 'Privacidade',
    links: [
      { href: '/privacidade', label: 'Política de Privacidade' },
      { href: '/termos', label: 'Termos de Uso' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-navy">
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Image src="/assets/maindy/logo/maindy-logo.png" alt="MAINDY" width={140} height={40} className="h-9 w-auto" />
          <p className="mt-4 text-sm leading-relaxed text-muted">Sua segunda memória. Sempre por perto.</p>
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="eyebrow">{g.title}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/80 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-x flex flex-col gap-2 border-t border-line py-6 text-xs text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} MAINDY. Em desenvolvimento.</p>
        <p>A MAINDY não é um serviço médico e não substitui acompanhamento profissional.</p>
      </div>
    </footer>
  );
}
