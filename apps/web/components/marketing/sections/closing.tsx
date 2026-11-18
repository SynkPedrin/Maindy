import { BrandFilm } from "../brand-film";
import { faq } from "../content";
import { Faq } from "../faq";
import { Magnetic, Reveal, RevealText } from "../motion";
import { ButtonLink, Container, Eyebrow, TextLink } from "../ui";

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="relative py-24 sm:py-32 lg:py-36">
      <Container className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5 lg:pr-8">
          <Eyebrow index="09">Perguntas frequentes</Eyebrow>
          <RevealText id="faq-title" as="h2" text="O que perguntam antes de conectar." className="mk-title mt-6 text-[clamp(2.1rem,4vw,3.4rem)] text-fg" />
          <p className="mt-6 text-[15px] leading-relaxed text-muted">Privacidade, compatibilidade, medição e cobrança — sem letras miúdas.</p>
          <div className="mt-6">
            <TextLink href="/ajuda">Central de ajuda</TextLink>
          </div>
        </div>
        <Reveal className="lg:col-span-7">
          <Faq items={faq} />
        </Reveal>
      </Container>
    </section>
  );
}

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden pb-24 pt-8 sm:pb-32 lg:pt-12">
      <div aria-hidden className="absolute left-1/2 top-1/2 size-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(143,32,255,.14),transparent)]" />
      <Container className="relative">
        <div className="mx-auto max-w-4xl text-center">
          <Eyebrow className="justify-center">Comece em modo observação</Eyebrow>
          <RevealText
            id="cta-title"
            as="h2"
            text="Meça primeiro. Economize depois."
            className="mk-title mt-6 text-[clamp(2.4rem,6vw,5.4rem)] text-fg"
          />
          <p className="mx-auto mt-6 max-w-xl text-[16.5px] leading-relaxed text-muted">
            O ORBIT começa observando sua carga real e só ativa otimizações quando há baseline. Você pode pausar tudo a qualquer momento.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Magnetic>
              <ButtonLink href="/cadastro">Começar a economizar</ButtonLink>
            </Magnetic>
            <ButtonLink href="/precos" variant="secondary" arrow={false}>
              Ver planos
            </ButtonLink>
          </div>
        </div>

        <Reveal className="mt-16 lg:mt-20">
          <figure className="relative overflow-hidden rounded-[28px] border border-line bg-bg-deep shadow-[0_60px_160px_-60px_rgba(143,32,255,.6)]">
            <div className="relative aspect-video">
              <BrandFilm />
            </div>
            <figcaption className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6">
              <span className="m-label text-[10px] text-fg/70">maindy. — ident oficial</span>
              <span className="m-label text-[10px] text-fg/70">6,5 s · sem som</span>
            </figcaption>
          </figure>
        </Reveal>
      </Container>
    </section>
  );
}
