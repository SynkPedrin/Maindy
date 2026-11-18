import { provenance } from "../content";
import { Reveal, RevealText } from "../motion";
import { Container, DemoBadge, Eyebrow, ProvenanceBadge } from "../ui";
import { ResultsReadouts } from "../results-readouts";

export function Results() {
  return (
    <section id="resultado" aria-labelledby="res-title" className="relative py-24 sm:py-32 lg:py-36">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Eyebrow index="05">Você vê o resultado</Eyebrow>
            <RevealText id="res-title" as="h2" text="Cada número diz de onde veio." className="mk-title mt-6 text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg" />
          </div>
          <Reveal className="lg:col-span-4 lg:col-start-9 lg:self-end" delay={0.1}>
            <p className="mk-lead text-[17px] leading-relaxed text-muted">
              Tokens medidos, custo registrado e economia líquida contra um baseline real — com a origem ao lado de cada valor. Sem fonte confiável,
              mostramos o traço.
            </p>
          </Reveal>
        </div>

        <Reveal className="mt-14">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <DemoBadge />
            <p className="m-label">Projeto exemplo · últimos 30 dias</p>
          </div>
          <ResultsReadouts />
        </Reveal>

        <Reveal className="mt-10 rounded-[20px] border border-line bg-surface-1/40 p-6 sm:p-8">
          <p className="m-label">Como calculamos</p>
          <p className="mt-4 font-mono text-[13px] leading-relaxed text-fg sm:text-[14.5px]">
            economia_líquida = custo_baseline − (custo_IA_otimizado + overhead)
          </p>
          <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-muted">
            O overhead inclui o custo da própria otimização (roteamento, validação, retries). Descontos nativos que já existiam no seu baseline,
            como prompt caching do provedor, não entram como economia da maindy.
          </p>
        </Reveal>

        <ul className="mt-10 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {provenance.map((p, i) => (
            <Reveal spot as="li" key={p.key} delay={i * 0.05} className="bg-bg p-6">
              <ProvenanceBadge source={p.key} />
              <p className="mt-4 text-[14px] leading-relaxed text-muted">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}

