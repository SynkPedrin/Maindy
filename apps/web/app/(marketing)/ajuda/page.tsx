import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { SUPPORT_EMAIL, faq } from "@/components/marketing/content";
import { Faq } from "@/components/marketing/faq";
import { JsonLd } from "@/components/marketing/json-ld";
import { Container, Eyebrow, TextLink } from "@/components/marketing/ui";

export const metadata: Metadata = {
  title: "Ajuda",
  description: "Perguntas frequentes sobre a maindy.: privacidade, integrações, assinaturas, medição de economia, qualidade e cobrança.",
  alternates: { canonical: "/ajuda" },
};

const extra = [
  {
    q: "Como pauso o ORBIT?",
    a: "No aplicativo desktop, pelo botão Pausar ORBIT do painel rápido, ou no painel web. A pausa é imediata e global: as requisições seguem diretamente para o provedor, sem otimização.",
  },
  {
    q: "O que acontece se o gateway local parar?",
    a: "O gateway é fail-open para erros de otimização: se uma técnica falha, a requisição original segue. Se o processo do gateway estiver parado, aponte temporariamente o base URL de volta para o provedor.",
  },
  {
    q: "Posso exportar ou excluir meus dados?",
    a: "Sim. A área da conta permite exportar seus dados em formato legível e excluir a conta, conforme a LGPD.",
  },
] as const;

const groups = [
  { id: "geral", title: "Produto e privacidade", items: faq.slice(0, 3) },
  { id: "medicao", title: "Medição e compatibilidade", items: faq.slice(3, 6) },
  { id: "conta", title: "Conta, cobrança e operação", items: [...faq.slice(6), ...extra] },
];

export default function AjudaPage() {
  const all = groups.flatMap((g) => g.items);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: all.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <section aria-labelledby="ajuda-title" className="relative pb-24 pt-32 sm:pt-40">
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(50%_60%_at_80%_0%,rgba(143,32,255,.18),transparent_70%)]" />
        <Container>
          <Eyebrow>Central de ajuda</Eyebrow>
          <h1 id="ajuda-title" className="mk-display mt-6 max-w-4xl text-[clamp(2.6rem,6.4vw,5.6rem)] text-fg">
            Respostas diretas, <span className="mk-ink-violet">sem letras miúdas.</span>
          </h1>

          <div className="mt-16 grid gap-12 lg:grid-cols-12">
            <div className="space-y-16 lg:col-span-8">
              {groups.map((g, i) => (
                <section key={g.id} id={g.id} aria-labelledby={`${g.id}-t`} className="scroll-mt-28">
                  <p className="m-label">{String(i + 1).padStart(2, "0")}</p>
                  <h2 id={`${g.id}-t`} className="mt-2 text-[26px] font-medium tracking-[-0.03em] text-fg">
                    {g.title}
                  </h2>
                  <div className="mt-6">
                    <Faq items={g.items} />
                  </div>
                </section>
              ))}
            </div>
            <aside className="lg:col-span-4">
              <div className="sticky top-28 rounded-[24px] border border-line bg-surface-1/50 p-7">
                <span className="flex size-11 items-center justify-center rounded-full border border-line-strong">
                  <Mail aria-hidden className="size-5 text-purple" />
                </span>
                <h2 className="mt-6 text-[22px] font-medium tracking-[-0.025em] text-fg">Fale com o suporte</h2>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
                  Não achou a resposta? Escreva para a gente. Nunca envie chaves de API ou conteúdo de prompts por e-mail.
                </p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-fg text-[14.5px] font-medium text-bg"
                >
                  {SUPPORT_EMAIL}
                </a>
                <p className="m-label mt-3 text-center text-[10px]">Endereço a confirmar</p>
                <div className="mt-8 space-y-3 border-t border-line pt-6">
                  <TextLink href="/metodologia">Como o ORBIT funciona</TextLink>
                  <br />
                  <TextLink href="/precos">Planos e Economy Guarantee</TextLink>
                  <br />
                  <TextLink href="/privacidade">Privacidade e LGPD</TextLink>
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
