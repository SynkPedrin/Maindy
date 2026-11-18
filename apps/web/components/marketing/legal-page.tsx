import { Container, Eyebrow } from "./ui";

export type LegalSection = { id: string; title: string; body: React.ReactNode };

export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <section aria-labelledby="legal-title" className="relative pb-24 pt-32 sm:pt-40">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(50%_60%_at_20%_0%,rgba(143,32,255,.16),transparent_70%)]" />
      <Container>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 id="legal-title" className="mk-display mt-6 max-w-4xl text-[clamp(2.6rem,6vw,5.2rem)] text-fg">
          {title}
        </h1>
        <div
          role="note"
          className="mt-8 flex max-w-3xl items-start gap-3 rounded-[16px] border border-warning/30 bg-warning/[0.05] p-4 text-[14px] leading-relaxed text-warning"
        >
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-warning" />
          <p>
            <strong className="font-medium">Minuta — revisão jurídica pendente.</strong> Este texto descreve o funcionamento pretendido do produto
            e ainda não foi revisado por advogado. Não substitui o documento final, que será publicado antes do lançamento comercial.
          </p>
        </div>
        <p className="m-label mt-6">Última atualização: {updated}</p>

        <div className="mt-14 grid gap-12 lg:grid-cols-12">
          <nav aria-label="Seções" className="hidden lg:col-span-3 lg:block">
            <ol className="sticky top-28 space-y-1 border-l border-line">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="-ml-px flex gap-3 border-l border-transparent py-1.5 pl-4 text-[14px] text-muted transition-colors hover:border-purple hover:text-fg"
                  >
                    <span className="font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="mk-prose max-w-3xl lg:col-span-8 lg:col-start-5">
            <div className="text-[17px] leading-relaxed text-muted">{intro}</div>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`}>
                <h2 id={`${s.id}-t`}>
                  <span className="mr-3 font-mono text-[13px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </Container>
    </section>
  );
}
