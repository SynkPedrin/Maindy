import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { SUPPORT_EMAIL } from "./content";
import { Container } from "./ui";

const columns = [
  {
    title: "Produto",
    links: [
      { label: "ORBIT Engine™", href: "/metodologia" },
      { label: "Integrações", href: "/#como-funciona" },
      { label: "Preços", href: "/precos" },
      { label: "Economy Guarantee", href: "/precos#garantia" },
    ],
  },
  {
    title: "Conta",
    links: [
      { label: "Criar conta", href: "/cadastro" },
      { label: "Login", href: "/login" },
      { label: "Ajuda", href: "/ajuda" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacidade", href: "/privacidade" },
      { label: "Termos de uso", href: "/termos" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-line bg-bg-deep">
      <Container className="grid gap-12 py-16 lg:grid-cols-12 lg:py-20">
        <div className="lg:col-span-5">
          <Wordmark height={30} />
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">
            Sua IA trabalha mais. Você gasta menos. Uma camada de eficiência para APIs, agentes e ferramentas de desenvolvimento.
          </p>
          <p className="mt-6 text-[14px] text-muted">
            Suporte:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-purple">
              {SUPPORT_EMAIL}
            </a>{" "}
            <span className="m-label ml-1 normal-case tracking-normal">(endereço a confirmar)</span>
          </p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="m-label">{col.title}</p>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[15px] text-muted transition-colors hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <Container>
        <div className="flex flex-col gap-3 border-t border-line py-6 text-[13px] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} maindy. Todos os direitos reservados.</p>
          <p>Preços e termos provisórios · ORBIT Engine™ é a metodologia de eficiência da maindy.</p>
        </div>
      </Container>
    </footer>
  );
}
