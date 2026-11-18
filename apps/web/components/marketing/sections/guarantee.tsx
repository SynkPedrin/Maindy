import { guaranteeConditions } from "../content";
import { Reveal, RevealText } from "../motion";
import { Container, Eyebrow } from "../ui";

const excluded = [
  "Limites semanais ou de sessão de Claude, ChatGPT ou Codex — não alteramos limites oficiais.",
  "Cargas sem baseline válido ou abaixo do volume mínimo elegível.",
  "Descontos nativos do provedor que já existiam no seu baseline.",
  "Economia hipotética que não virou custo evitado registrado.",
];

export function Guarantee({ index = "08" }: { index?: string }) {
  return (
    <section id="garantia" aria-labelledby="garantia-title" className="relative overflow-hidden py-24 sm:py-32 lg:py-36">
      <div aria-hidden className="pointer-events-none absolute -right-64 -top-48 size-[720px] rounded-full border border-line/60" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-24 size-[480px] rounded-full border border-gold/15" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-10 size-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(255,210,31,.07),transparent)]" />
      <Container className="relative">
        <Eyebrow index={index}>Economy Guarantee</Eyebrow>
        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <RevealText
              id="garantia-title"
              as="h2"
              text="Meta de 30–60% para cargas qualificadas. Medida, não prometida."
              className="mk-title text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg"
            />
          </div>
          <Reveal className="lg:col-span-4 lg:self-end" delay={0.1}>
            <p className="mk-lead text-[17px] leading-relaxed text-muted">
              A Economy Guarantee é contratual e condicionada. Ela vale quando quatro condições são atendidas — e a apuração é feita com os mesmos
              relatórios rastreáveis que você vê no painel.
            </p>
          </Reveal>
        </div>

        <ol className="mt-16 grid gap-px overflow-hidden rounded-[24px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {guaranteeConditions.map((c, i) => (
            <Reveal spot as="li" key={c.k} delay={i * 0.06} className="relative bg-bg p-7 sm:p-8">
              <span className="mk-num text-[56px] text-transparent [-webkit-text-stroke:1px_rgba(255,210,31,.7)]">{c.k}</span>
              <h3 className="mt-6 text-[19px] font-medium tracking-[-0.02em] text-fg">{c.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{c.body}</p>
            </Reveal>
          ))}
        </ol>

        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <Reveal className="rounded-[20px] border border-line bg-surface-1/40 p-6 sm:p-8 lg:col-span-7">
            <p className="m-label">Fora da garantia</p>
            <ul className="mt-5 space-y-3">
              {excluded.map((e) => (
                <li key={e} className="flex gap-3 text-[14.5px] leading-relaxed text-muted">
                  <span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-error/70" />
                  {e}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="rounded-[20px] border border-warning/25 bg-warning/[0.04] p-6 sm:p-8 lg:col-span-5" delay={0.08}>
            <p className="m-label text-warning">Em definição</p>
            <p className="mt-5 text-[14.5px] leading-relaxed text-muted">
              Volume mínimo, duração da janela de avaliação e a contrapartida caso a meta não seja atingida serão definidos nos termos contratuais
              de cada plano. Até lá, 30–60% é uma meta comercial — não um resultado comprovado.
            </p>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
