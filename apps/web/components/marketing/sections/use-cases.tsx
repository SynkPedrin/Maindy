import { useCases } from "../content";
import { Reveal, RevealText } from "../motion";
import { Container, Eyebrow } from "../ui";

export function UseCases() {
  return (
    <section id="casos" aria-labelledby="casos-title" className="relative py-24 sm:py-32 lg:py-36">
      <Container>
        <Eyebrow index="06">Casos de uso</Eyebrow>
        <RevealText
          id="casos-title"
          as="h2"
          text="Feita para quem paga a conta da IA."
          className="mk-title mt-6 max-w-4xl text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg"
        />
        <ol className="mt-14 border-t border-line lg:mt-20">
          {useCases.map((u, i) => (
            <Reveal spot
              as="li"
              key={u.k}
              delay={i * 0.05}
              className="group relative grid gap-4 border-b border-line py-8 transition-colors duration-300 lg:grid-cols-12 lg:gap-8 lg:py-10"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-5 w-px origin-top scale-y-0 bg-gradient-to-b from-violet via-purple to-transparent transition-transform duration-500 ease-out-expo group-hover:scale-y-100 sm:-left-8"
              />
              <div className="flex items-baseline gap-5 lg:col-span-4">
                <span className="font-mono text-[11px] tracking-[0.14em] text-subtle">{u.k}</span>
                <h3 className="text-[clamp(1.6rem,2.5vw,2.15rem)] font-medium tracking-[-0.035em] text-fg">{u.who}</h3>
              </div>
              <p className="text-[15.5px] leading-relaxed text-muted lg:col-span-3 lg:pt-2">{u.pain}</p>
              <p className="text-[15.5px] leading-relaxed text-fg/90 lg:col-span-3 lg:pt-2">{u.gain}</p>
              <div className="lg:col-span-2 lg:pt-2 lg:text-right">
                <span className="inline-flex rounded-full border border-line-strong px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {u.plan}
                </span>
              </div>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
