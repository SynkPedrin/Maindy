import type { Metadata } from "next";
import { faq } from "@/components/marketing/content";
import { Faq } from "@/components/marketing/faq";
import { getPlans } from "@/components/marketing/plans";
import { ComparisonTable, Pricing } from "@/components/marketing/pricing";
import { Guarantee } from "@/components/marketing/sections/guarantee";
import { Container, Eyebrow, OrbitArcs } from "@/components/marketing/ui";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Preços",
  description:
    "Planos Starter, Pro e Master Economy da maindy. Valores provisórios, ciclo mensal ou anual, comparação de recursos e condições da Economy Guarantee.",
  alternates: { canonical: "/precos" },
  openGraph: { title: "Preços — maindy.", url: "/precos" },
};

const billingFaq = faq.filter((f) => /pago|preços|assinatura/i.test(f.q));

export default async function PrecosPage() {
  const { plans, source } = await getPlans();
  return (
    <>
      <section aria-labelledby="precos-title" className="mk-grain relative isolate overflow-hidden pb-16 pt-32 sm:pt-40">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(143,32,255,.22),transparent_70%)]" />
          <OrbitArcs className="inset-x-0 top-0 h-[80vh] w-full opacity-60 [mask-image:linear-gradient(to_bottom,black_50%,transparent)]" />
        </div>
        <Container>
          <Eyebrow>Planos e preços</Eyebrow>
          <h1 id="precos-title" className="mk-display mt-6 text-[clamp(2.8rem,6.6vw,6.6rem)] text-fg">
            Pague pela eficiência, <br className="hidden lg:block" />
            <span className="mk-ink-violet">não pelo desperdício.</span>
          </h1>
          <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:items-end">
            <p className="mk-lead max-w-2xl text-[17px] leading-relaxed text-muted sm:text-[19px] lg:col-span-7">
              A assinatura maindy. é separada do que você paga ao seu provedor de IA. Você continua com a sua conta e a sua chave — nós medimos,
              otimizamos e mostramos o resultado líquido.
            </p>
            <div className="flex flex-col items-start gap-2 lg:col-span-4 lg:col-start-9 lg:items-end">
              {plans.some((p) => p.provisional) ? (
                <span className="rounded-full border border-warning/30 bg-warning/[0.05] px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-warning">
                  Valores provisórios
                </span>
              ) : null}
              {source === "fallback" ? (
                <p className="max-w-xs text-[12.5px] text-subtle lg:text-right">Tabela de referência exibida enquanto o catálogo de planos não responde.</p>
              ) : null}
            </div>
          </div>
          <div className="mt-14">
            <Pricing plans={plans} />
          </div>
        </Container>
      </section>

      <section aria-labelledby="comparar-title" className="py-20 sm:py-28">
        <Container>
          <Eyebrow index="01">Comparação</Eyebrow>
          <h2 id="comparar-title" className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg">
            Escopo, mecanismos e suporte.
          </h2>
          <div className="mt-10">
            <ComparisonTable plans={plans} />
          </div>
          <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-subtle">
            Recursos de integração dependem das interfaces oficiais de cada provedor. Limites de recursos são aplicados no servidor. Não revendemos
            cotas de Claude, ChatGPT ou Codex.
          </p>
        </Container>
      </section>

      <div className="border-t border-line">
        <Guarantee index="02" />
      </div>

      <section aria-labelledby="faq-precos" className="border-t border-line py-20 sm:py-28">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Eyebrow index="03">Cobrança</Eyebrow>
            <h2 id="faq-precos" className="mk-title mt-5 text-[clamp(2rem,3.4vw,3rem)] text-fg">
              Dúvidas sobre planos.
            </h2>
          </div>
          <div className="lg:col-span-8">
            <Faq items={billingFaq} />
          </div>
        </Container>
      </section>
    </>
  );
}
