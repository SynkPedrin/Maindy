import { connectors, notDone } from "../content";
import { Reveal, RevealText } from "../motion";
import { CapabilityBadge, Container, Eyebrow } from "../ui";

export function Connectors() {
  return (
    <section id="como-funciona" aria-labelledby="conn-title" className="relative py-24 sm:py-32 lg:py-36">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Eyebrow index="03">Conecte suas ferramentas</Eyebrow>
            <RevealText
              id="conn-title"
              as="h2"
              text="Um endereço local. Suas chaves, seus provedores."
              className="mk-title mt-6 text-[clamp(2.3rem,5.4vw,4.6rem)] text-fg"
            />
          </div>
          <Reveal className="lg:col-span-4 lg:col-start-9 lg:self-end" delay={0.1}>
            <p className="mk-lead text-[17px] leading-relaxed text-muted">
              Você aponta o base URL para o gateway da maindy. e continua usando a sua própria chave. Onde a integração é parcial, dizemos
              exatamente o que funciona.
            </p>
          </Reveal>
        </div>

        {/* Flow strip */}
        <Reveal className="mt-14 overflow-hidden rounded-[20px] border border-line bg-surface-1/40">
          <div className="mk-rail flex items-stretch overflow-x-auto">
            {[
              { k: "Seu código", v: "SDK · agente · CLI" },
              { k: "Gateway local", v: "127.0.0.1:8787 · ORBIT" },
              { k: "Seu provedor", v: "sua chave · sua conta" },
              { k: "Painel", v: "só metadados · sem prompts" },
            ].map((s, i, arr) => (
              <div key={s.k} className="flex min-w-[220px] flex-1 items-center">
                <div className="flex-1 px-6 py-6">
                  <p className="m-label">0{i + 1}</p>
                  <p className="mt-3 text-[17px] font-medium tracking-[-0.01em] text-fg">{s.k}</p>
                  <p className="mt-1 font-mono text-[12px] text-muted">{s.v}</p>
                </div>
                {i < arr.length - 1 ? (
                  <svg aria-hidden viewBox="0 0 40 12" className="mr-2 w-10 shrink-0 text-purple" fill="none">
                    <path d="M0 6h36" stroke="currentColor" strokeDasharray="3 4" style={{ animation: "mk-dash 1.6s linear infinite" }} />
                    <path d="M33 2l4 4-4 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </div>
            ))}
          </div>
        </Reveal>

        {/* Capability matrix */}
        <div className="mt-14">
          <div className="hidden grid-cols-12 gap-6 border-b border-line pb-4 lg:grid">
            <p className="m-label col-span-3">Integração</p>
            <p className="m-label col-span-2">Status</p>
            <p className="m-label col-span-3">Como conecta</p>
            <p className="m-label col-span-4">Alcance</p>
          </div>
          <ul>
            {connectors.map((c, i) => (
              <Reveal spot
                as="li"
                key={c.name}
                delay={i * 0.04}
                className="group grid gap-3 border-b border-line py-6 transition-colors duration-300 hover:bg-white/[0.015] lg:grid-cols-12 lg:items-baseline lg:gap-6"
              >
                <div className="flex items-start justify-between gap-4 lg:col-span-3 lg:block">
                  <div>
                    <h3 className="text-[19px] font-medium tracking-[-0.02em] text-fg">{c.name}</h3>
                    <p className="m-label mt-1.5 text-[10px]">{c.group}</p>
                  </div>
                  <CapabilityBadge level={c.level} className="shrink-0 lg:hidden" />
                </div>
                <div className="hidden lg:col-span-2 lg:block">
                  <CapabilityBadge level={c.level} />
                </div>
                <p className="font-mono text-[12.5px] leading-relaxed text-muted lg:col-span-3">{c.how}</p>
                <div className="lg:col-span-4">
                  <p className="text-[14.5px] leading-relaxed text-muted">{c.detail}</p>
                  {c.note ? <p className="mt-2 text-[13px] text-warning/90">{c.note}</p> : null}
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal className="mt-12 grid gap-6 rounded-[20px] border border-error/20 bg-error/[0.03] p-6 sm:p-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="m-label text-error/90">O que não fazemos</p>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">Limites que não são nossos, continuam não sendo.</p>
          </div>
          <ul className="space-y-3 lg:col-span-8">
            {notDone.map((n) => (
              <li key={n} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="text-[15px] text-fg">{n}</span>
                <CapabilityBadge level="not_supported" />
              </li>
            ))}
          </ul>
        </Reveal>
        <p className="mt-6 max-w-3xl text-[12.5px] leading-relaxed text-subtle">
          Matriz da versão inicial. Integrações dependem das interfaces oficiais de cada provedor e podem mudar. Nomes de produtos de terceiros são
          usados apenas para indicar compatibilidade e pertencem aos seus titulares; não há parceria ou endosso implícito.
        </p>
      </Container>
    </section>
  );
}
