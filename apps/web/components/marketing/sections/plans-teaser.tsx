import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPrice, isPriceFloor } from "../format";
import { ExpandOnEnter, Reveal, RevealText } from "../motion";
import type { PlansResult } from "../plans";
import { Container, Eyebrow, TextLink } from "../ui";

export function PlansTeaser({ data }: { data: PlansResult }) {
  return (
    <ExpandOnEnter id="planos" labelledBy="planos-title" className="relative bg-bg-deep py-24 sm:py-32 lg:py-36">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Eyebrow index="07">Planos</Eyebrow>
            <RevealText
              id="planos-title"
              as="h2"
              text="Comece pequeno. Escale com dados."
              className="mk-title mt-6 max-w-3xl text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg"
            />
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            {data.plans.some((p) => p.provisional) ? (
            <span className="rounded-full border border-warning/30 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-warning">
                Valores provisórios
              </span>
            ) : null}
            <TextLink href="/precos">Comparar planos em detalhe</TextLink>
          </div>
        </div>

        <ul className="mt-14 grid gap-4 lg:grid-cols-3">
          {data.plans.map((p, i) => (
            <Reveal spot
              as="li"
              key={p.code}
              delay={i * 0.06}
              className={cn(
                "relative flex flex-col rounded-[24px] border p-7 sm:p-8",
                p.highlighted
                  ? "border-purple/40 bg-[linear-gradient(180deg,rgba(143,32,255,.14),rgba(21,17,46,.6))] shadow-[0_40px_100px_-40px_rgba(164,36,255,.6)]"
                  : "border-line bg-surface-1/40",
              )}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[22px] font-medium tracking-[-0.025em] text-fg">{p.name}</h3>
                {p.highlighted ? <span className="m-label text-purple">Recomendado</span> : null}
              </div>
              <p className="mt-2 text-[14.5px] text-muted">{p.tagline}</p>
              <p className="mt-8 flex items-baseline gap-2">
                {isPriceFloor(p) ? <span className="text-[13px] text-muted">a partir de</span> : null}
                {p.priceMonthlyCents != null ? (
                  <>
                    <span className="mk-num text-[44px] text-fg">{formatPrice(p.priceMonthlyCents, p.currency)}</span>
                    <span className="text-[14px] text-muted">/mês</span>
                  </>
                ) : (
                  <span className="mk-num text-[36px] text-fg">Sob consulta</span>
                )}
              </p>
              <ul className="mt-8 space-y-3 border-t border-line pt-6">
                {p.features.slice(0, 5).map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[14.5px] text-fg/90">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-purple" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  href={`/cadastro?plano=${p.code}`}
                  className={cn(
                    "inline-flex h-11 w-full items-center justify-center rounded-full text-[14.5px] font-medium transition-colors duration-200",
                    p.highlighted ? "bg-fg text-bg hover:bg-white" : "border border-line-strong text-fg hover:bg-white/[0.05]",
                  )}
                >
                  Escolher {p.name}
                </Link>
              </div>
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 text-[12.5px] text-subtle">
          Preços em reais, provisórios até confirmação comercial. A assinatura maindy. é separada do que você paga ao seu provedor de IA.
          {data.source === "fallback" ? " Exibindo tabela de referência." : null}
        </p>
      </Container>
    </ExpandOnEnter>
  );
}
