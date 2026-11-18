import { DesktopDemo } from "../desktop-demo";
import { ExpandOnEnter, Reveal, RevealText } from "../motion";
import { Container, Eyebrow } from "../ui";

export function AppPreview() {
  return (
    <ExpandOnEnter id="aplicativo" labelledBy="app-title" className="relative overflow-hidden bg-bg-deep py-24 sm:py-32 lg:py-36">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />
      <div aria-hidden className="absolute left-1/2 top-1/3 size-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(143,32,255,.12),transparent)]" />
      <Container className="relative">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Eyebrow index="04">Aplicativo desktop</Eyebrow>
            <RevealText
              id="app-title"
              as="h2"
              text="Discreto no notch. Completo quando você precisa."
              className="mk-title mt-6 text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg"
            />
          </div>
          <Reveal className="lg:col-span-4 lg:col-start-9 lg:self-end" delay={0.1}>
            <p className="mk-lead text-[17px] leading-relaxed text-muted">
              No Mac, uma ilha junto ao notch. No Windows, um launcher compacto que encaixa na borda. Pausar o ORBIT é um clique — e as requisições
              seguem sem otimização.
            </p>
          </Reveal>
        </div>
        <Reveal className="mt-14">
          <DesktopDemo />
        </Reveal>
        <p className="mt-5 text-[12.5px] text-subtle">
          Mockups interativos feitos em HTML a partir do design do aplicativo. Não são capturas de tela de produção.
        </p>
      </Container>
    </ExpandOnEnter>
  );
}
