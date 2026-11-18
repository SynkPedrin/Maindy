import { CompareSlider } from "../compare-slider";
import { wasteKinds } from "../content";
import { Reveal, RevealText } from "../motion";
import { Container, Eyebrow } from "../ui";

const glyphs = [
  // duplicate requests
  <svg key="a" viewBox="0 0 48 48" fill="none" className="size-10" aria-hidden>
    <rect x="6" y="10" width="26" height="18" rx="4" stroke="currentColor" strokeOpacity=".5" />
    <rect x="16" y="20" width="26" height="18" rx="4" stroke="currentColor" />
  </svg>,
  // repeated context
  <svg key="b" viewBox="0 0 48 48" fill="none" className="size-10" aria-hidden>
    {[10, 18, 26, 34].map((y) => (
      <path key={y} d={`M8 ${y}h${y === 34 ? 18 : 32}`} stroke="currentColor" strokeOpacity={y === 34 ? 1 : 0.45} strokeLinecap="round" />
    ))}
  </svg>,
  // loops
  <svg key="c" viewBox="0 0 48 48" fill="none" className="size-10" aria-hidden>
    <path d="M24 10a14 14 0 1 1-13.3 9.6" stroke="currentColor" strokeLinecap="round" />
    <path d="M8 13l2.7 6.6 6.6-2.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  // over-read code
  <svg key="d" viewBox="0 0 48 48" fill="none" className="size-10" aria-hidden>
    <rect x="9" y="6" width="30" height="36" rx="4" stroke="currentColor" strokeOpacity=".5" />
    <path d="M15 16h18M15 22h18M15 28h18M15 34h10" stroke="currentColor" strokeOpacity=".45" strokeLinecap="round" />
    <path d="M15 22h12" stroke="currentColor" strokeLinecap="round" />
  </svg>,
];

export function Problem() {
  return (
    <section id="problema" aria-labelledby="problema-title" className="relative py-24 sm:py-32 lg:py-36">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Eyebrow index="01">O custo invisível</Eyebrow>
            <RevealText
              id="problema-title"
              as="h2"
              text="O desperdício não aparece na fatura. Mas está nela."
              className="mk-title mt-6 text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg"
            />
          </div>
          <Reveal className="lg:col-span-4 lg:col-start-9 lg:self-end" delay={0.1}>
            <p className="mk-lead text-[17px] leading-relaxed text-muted">
              Requisições duplicadas, contexto reenviado a cada chamada, agentes presos em loop e arquivos inteiros lidos para mudar uma linha.
              Tudo vira token. Tudo vira custo.
            </p>
          </Reveal>
        </div>

        <ul className="mt-16 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          {wasteKinds.map((w, i) => (
            <Reveal spot as="li" key={w.k} delay={i * 0.06} className="group relative bg-bg p-6 transition-colors duration-300 hover:bg-surface-1 sm:p-7">
              <div className="flex items-start justify-between text-error/80 transition-colors duration-300 group-hover:text-error">
                {glyphs[i]}
                <span className="font-mono text-[11px] tracking-[0.14em] text-subtle">{w.k}</span>
              </div>
              <h3 className="mt-10 text-[19px] font-medium tracking-[-0.02em] text-fg">{w.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{w.body}</p>
            </Reveal>
          ))}
        </ul>

        <Reveal className="mt-20 lg:mt-28">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="mk-title max-w-xl text-[clamp(1.6rem,3vw,2.4rem)] text-fg">Antes e depois, na mesma sessão.</h3>
            <p className="max-w-sm text-[14.5px] text-muted">Arraste para ver o que o ORBIT faz com o que se repete, o que é verboso e o que entra em loop.</p>
          </div>
          <CompareSlider />
        </Reveal>
      </Container>
    </section>
  );
}
