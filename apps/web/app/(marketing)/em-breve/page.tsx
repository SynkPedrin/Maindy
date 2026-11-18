import type { Metadata } from "next";
import { Container, Eyebrow, TextLink } from "@/components/marketing/ui";

export const metadata: Metadata = {
  title: "Em breve",
  description: "A área da conta da maindy. abre em breve. Conheça a metodologia ORBIT e os planos enquanto isso.",
  robots: { index: false, follow: true },
};

export default function EmBreve() {
  return (
    <section className="relative isolate overflow-hidden pt-40 pb-32">
      <Container>
        <Eyebrow>Acesso antecipado</Eyebrow>
        <h1 className="mk-display mt-6 max-w-3xl text-[clamp(2.5rem,6vw,5rem)] text-fg">A área da conta abre em breve.</h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
          Cadastro, painel e download do app estão em fase final de validação. Enquanto isso, veja como a metodologia ORBIT mede e reduz o
          desperdício de IA, e confira os planos.
        </p>
        <div className="mt-10 flex flex-wrap gap-6 text-[15px]">
          <TextLink href="/metodologia">Conhecer a metodologia</TextLink>
          <TextLink href="/precos">Ver planos</TextLink>
          <TextLink href="/ajuda">Perguntas frequentes</TextLink>
        </div>
      </Container>
    </section>
  );
}
