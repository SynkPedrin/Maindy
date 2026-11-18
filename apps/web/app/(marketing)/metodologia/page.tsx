import type { Metadata } from "next";
import { MODE_DEFAULT_TECHNIQUES, type OrbitMode, type TechniqueName } from "@maindy/contracts";
import { orbitModeLabel } from "@maindy/design-system";
import { orbitDetail, provenance } from "@/components/marketing/content";
import { JsonLd, siteUrl } from "@/components/marketing/json-ld";
import { Reveal, RevealText } from "@/components/marketing/motion";
import { ButtonLink, Container, Eyebrow, OrbitArcs, ProvenanceBadge } from "@/components/marketing/ui";

export const metadata: Metadata = {
  title: "Metodologia ORBIT Engine™",
  description:
    "Como a maindy. observa, reduz, balanceia, aprende e testa: as cinco etapas do ORBIT Engine™, modos de operação, origem de cada número, métodos de baseline e Quality Guard.",
  alternates: { canonical: "/metodologia" },
  openGraph: { title: "ORBIT Engine™ — a metodologia de eficiência da maindy.", url: "/metodologia" },
};

const techniqueLabel: Record<TechniqueName, string> = {
  exact_cache: "Cache determinístico",
  semantic_cache: "Cache semântico (somente opt-in)",
  tool_output_compression: "Compressão de saídas de ferramentas",
  context_dedup: "Deduplicação de contexto",
  loop_guard: "Loop guard",
  retry_budget: "Orçamento de retries",
  output_budget: "Orçamento de saída",
  model_routing: "Roteamento de modelo por política",
  prompt_cache_hints: "Dicas de prompt caching do provedor",
};

const modeBlurb: Record<OrbitMode, string> = {
  observe: "Só mede. Nenhuma requisição é alterada. É assim que todo projeto começa e como o baseline é construído.",
  conservative: "Técnicas sem impacto no conteúdo das respostas: cache exato, bloqueio de loops e limite de retries.",
  balanced: "Adiciona compressão de saídas, deduplicação de contexto e dicas de cache do provedor, com Quality Guard ativo.",
  maximum: "Inclui orçamento de saída e roteamento de modelo por política. Exige critérios de aceite definidos.",
};

const stageMeasures: Record<string, { measures: string; guard: string }> = {
  O: { measures: "Tokens de entrada, saída e cache, custo, latência, taxa de repetição e erros por projeto e agente.", guard: "Nada é otimizado nesta fase. A instrumentação não pode custar mais do que economiza." },
  R: { measures: "Tokens antes e depois de cada técnica, contados localmente, por requisição.", guard: "Cache isolado por projeto e invalidado por versão; cache semântico proibido para dados dinâmicos ou sensíveis sem política." },
  B: { measures: "Custo, prazo e exigência de qualidade de cada tarefa elegível.", guard: "Roteamento só com política explícita e consentimento. Execução local apenas quando autorizada." },
  I: { measures: "Quais técnicas geram economia líquida sem regressão, por projeto, com dados autorizados.", guard: "Toda política é versionada e tem rollback por técnica." },
  T: { measures: "Critérios de aceite, testes, consistência de tool use e custo líquido com overhead.", guard: "Regressão ou latência acima do limite → técnica revertida e requisição original (fallback_original)." },
};

const baselines = [
  { code: "cache_replay", title: "Replay de cache", body: "Em um acerto de cache, o baseline é o custo medido da resposta original armazenada: tokens reais × preço vigente." },
  { code: "pre_optimization_tokens", title: "Tokens antes da técnica", body: "Para compressão e deduplicação, o baseline usa os tokens de entrada contados localmente antes da técnica, mais a saída real." },
  { code: "paired_sample", title: "Amostra pareada", body: "Experimentos controlados em modo shadow comparam a mesma classe de tarefa com e sem otimização." },
  { code: "none", title: "Sem baseline", body: "Quando não há comparação válida, a requisição não entra no cálculo de economia. Ponto." },
];

const formulas = [
  { k: "economia_bruta", f: "custo_baseline − custo_IA_otimizado", n: "Somente onde existe baseline válido." },
  { k: "economia_líquida", f: "custo_baseline − (custo_IA_otimizado + overhead)", n: "Overhead inclui roteamento, cache, validação e retries." },
  { k: "benefício_líquido", f: "economia_líquida − assinatura_rateada − taxas", n: "O número que importa para o seu caixa." },
  { k: "multiplicador", f: "custo_baseline ÷ (custo_IA_otimizado + overhead)", n: "Só para tarefas aceitas pelo Quality Guard e benchmark comparável." },
];

const notClaimed = [
  "Que 30–60% de economia é garantido para qualquer carga. É uma meta para cargas qualificadas.",
  "Que aumentamos limites semanais ou de sessão de Claude, ChatGPT ou Codex.",
  "Que descontos nativos do provedor (como prompt caching) são economia nossa.",
  "Que custo evitado hipotético é dinheiro economizado sem identificação como estimativa.",
  "Que temos acesso ao histórico ou à telemetria oculta de apps de chat.",
  "Que qualquer número de demonstração no site é medição real.",
];

const toc = [
  ["etapas", "As cinco etapas"],
  ["modos", "Modos de operação"],
  ["origem", "Origem dos números"],
  ["baseline", "Baseline"],
  ["formulas", "Fórmulas"],
  ["quality-guard", "Quality Guard"],
  ["nao-afirmamos", "O que não afirmamos"],
] as const;

export default function MetodologiaPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "ORBIT Engine™ — a metodologia adaptativa de eficiência da maindy.",
          inLanguage: "pt-BR",
          url: `${siteUrl}/metodologia`,
          author: { "@type": "Organization", name: "maindy." },
        }}
      />
      <section aria-labelledby="met-title" className="mk-grain relative isolate overflow-hidden pb-16 pt-32 sm:pt-40 lg:pb-24">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_80%_20%,rgba(143,32,255,.2),transparent_70%)]" />
          <OrbitArcs className="inset-x-0 top-0 h-[90vh] w-full opacity-70 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />
        </div>
        <Container>
          <Eyebrow>Metodologia</Eyebrow>
          <h1 id="met-title" className="mk-display mt-6 text-[clamp(3rem,10vw,9rem)] text-fg">
            ORBIT <span className="mk-ink-violet">Engine™</span>
          </h1>
          <div className="mt-10 grid gap-10 lg:grid-cols-12">
            <p className="mk-lead text-[18px] leading-relaxed text-muted sm:text-[20px] lg:col-span-6">
              A metodologia adaptativa de eficiência da maindy. Começa observando, só otimiza com baseline, aprende por projeto e reverte o que
              piora a entrega. Não é um prompt de instruções: é uma biblioteca, um gateway local e um processo de medição.
            </p>
            <dl className="grid grid-cols-2 gap-px self-end overflow-hidden rounded-[20px] border border-line bg-line lg:col-span-5 lg:col-start-8">
              {[
                ["05", "etapas"],
                ["04", "modos de operação"],
                ["04", "origens de dado"],
                ["0", "prompts enviados à nuvem por padrão"],
              ].map(([v, l]) => (
                <div key={l} className="bg-bg p-5">
                  <dt className="sr-only">{l}</dt>
                  <dd>
                    <span className="mk-num block text-[40px] text-fg">{v}</span>
                    <span className="mt-2 block text-[13px] text-muted">{l}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      <Container className="grid gap-12 pb-24 lg:grid-cols-12 lg:pb-32">
        <nav aria-label="Nesta página" className="hidden lg:col-span-3 lg:block">
          <div className="sticky top-28">
            <p className="m-label">Nesta página</p>
            <ol className="mt-5 space-y-1 border-l border-line">
              {toc.map(([id, label], i) => (
                <li key={id}>
                  <a href={`#${id}`} className="-ml-px flex gap-3 border-l border-transparent py-1.5 pl-4 text-[14px] text-muted transition-colors hover:border-purple hover:text-fg">
                    <span className="font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className="min-w-0 space-y-28 lg:col-span-9">
          {/* Stages */}
          <section id="etapas" aria-labelledby="etapas-t" className="scroll-mt-28">
            <Eyebrow index="01">As cinco etapas</Eyebrow>
            <RevealText id="etapas-t" text="Observar, reduzir, balancear, aprender, testar." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <ol className="mt-12 space-y-4">
              {orbitDetail.map((s, i) => (
                <Reveal as="li" key={s.key} className="grid gap-6 rounded-[24px] border border-line bg-surface-1/40 p-6 sm:p-8 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <span className="mk-num text-[88px] text-transparent [-webkit-text-stroke:1.2px_rgba(199,36,255,.85)]">{s.key}</span>
                    <p className="m-label mt-2">Etapa 0{i + 1}</p>
                    <h3 className="mt-1 text-[26px] font-medium tracking-[-0.03em] text-fg">{s.name}</h3>
                  </div>
                  <div className="space-y-5 md:col-span-8">
                    <p className="text-[16px] leading-relaxed text-fg/90">{s.summary}</p>
                    <div>
                      <p className="m-label">Técnicas</p>
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {s.techniques.map((t) => (
                          <li key={t} className="rounded-full border border-line-strong px-3 py-1 text-[13px] text-muted">
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
                      <div>
                        <p className="m-label">O que mede</p>
                        <p className="mt-2 text-[14px] leading-relaxed text-muted">{stageMeasures[s.key]!.measures}</p>
                      </div>
                      <div>
                        <p className="m-label">Proteção</p>
                        <p className="mt-2 text-[14px] leading-relaxed text-muted">{stageMeasures[s.key]!.guard}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </section>

          {/* Modes */}
          <section id="modos" aria-labelledby="modos-t" className="scroll-mt-28">
            <Eyebrow index="02">Modos de operação</Eyebrow>
            <RevealText id="modos-t" text="Você escolhe o quanto o ORBIT pode agir." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <ol className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-line bg-line sm:grid-cols-2">
              {(Object.keys(MODE_DEFAULT_TECHNIQUES) as OrbitMode[]).map((m, i) => (
                <Reveal as="li" key={m} delay={i * 0.05} className="bg-bg p-6 sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="flex gap-1" aria-hidden>
                      {[0, 1, 2, 3].map((d) => (
                        <span key={d} className={d <= i ? "h-3 w-1.5 rounded-full bg-purple" : "h-3 w-1.5 rounded-full bg-line-strong"} />
                      ))}
                    </span>
                    <h3 className="text-[22px] font-medium tracking-[-0.025em] text-fg">{orbitModeLabel[m]}</h3>
                  </div>
                  <p className="mt-4 text-[14.5px] leading-relaxed text-muted">{modeBlurb[m]}</p>
                  <ul className="mt-5 space-y-1.5">
                    {MODE_DEFAULT_TECHNIQUES[m].length === 0 ? (
                      <li className="font-mono text-[12px] text-subtle">nenhuma técnica ativa — só medição</li>
                    ) : (
                      MODE_DEFAULT_TECHNIQUES[m].map((t) => (
                        <li key={t} className="flex items-center gap-2.5 text-[13.5px] text-fg/85">
                          <span aria-hidden className="h-px w-3 bg-purple" />
                          {techniqueLabel[t]}
                        </li>
                      ))
                    )}
                  </ul>
                </Reveal>
              ))}
            </ol>
            <p className="mt-4 text-[13px] text-subtle">Pausa global imediata disponível em todos os modos. Em pausa, as requisições seguem sem otimização.</p>
          </section>

          {/* Provenance */}
          <section id="origem" aria-labelledby="origem-t" className="scroll-mt-28">
            <Eyebrow index="03">Origem dos números</Eyebrow>
            <RevealText id="origem-t" text="Todo número carrega a sua fonte." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <ul className="mt-12 divide-y divide-line border-y border-line">
              {provenance.map((p) => (
                <Reveal as="li" key={p.key} className="grid gap-3 py-6 sm:grid-cols-12 sm:items-baseline">
                  <div className="sm:col-span-5">
                    <ProvenanceBadge source={p.key} />
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted sm:col-span-7">{p.body}</p>
                </Reveal>
              ))}
            </ul>
          </section>

          {/* Baselines */}
          <section id="baseline" aria-labelledby="baseline-t" className="scroll-mt-28">
            <Eyebrow index="04">Métodos de baseline</Eyebrow>
            <RevealText id="baseline-t" text="Sem baseline válido, não há economia." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2">
              {baselines.map((b, i) => (
                <Reveal as="li" key={b.code} delay={i * 0.05} className="rounded-[20px] border border-line bg-surface-1/40 p-6">
                  <p className="font-mono text-[12px] text-purple">{b.code}</p>
                  <h3 className="mt-3 text-[19px] font-medium tracking-[-0.02em] text-fg">{b.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{b.body}</p>
                </Reveal>
              ))}
            </ul>
          </section>

          {/* Formulas */}
          <section id="formulas" aria-labelledby="formulas-t" className="scroll-mt-28">
            <Eyebrow index="05">Fórmulas</Eyebrow>
            <RevealText id="formulas-t" text="As contas, abertas." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <div className="mt-12 overflow-hidden rounded-[20px] border border-line bg-bg-deep">
              {formulas.map((f) => (
                <Reveal key={f.k} className="grid gap-2 border-b border-line p-5 last:border-0 sm:p-6 md:grid-cols-12 md:gap-6">
                  <p className="font-mono text-[13px] text-purple md:col-span-3">{f.k}</p>
                  <p className="font-mono text-[13px] leading-relaxed text-fg md:col-span-5">= {f.f}</p>
                  <p className="text-[13.5px] leading-relaxed text-muted md:col-span-4">{f.n}</p>
                </Reveal>
              ))}
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-subtle">
              Relatórios são auditáveis: IDs de execução, versão da tabela de preços, versão do comparador e trilha de origem. Moeda, câmbio (fonte
              e data) e tributos são explicitados quando aplicáveis.
            </p>
          </section>

          {/* Quality Guard */}
          <section id="quality-guard" aria-labelledby="qg-t" className="scroll-mt-28">
            <Eyebrow index="06">Quality Guard</Eyebrow>
            <RevealText id="qg-t" text="Qualidade é um portão, não um gráfico." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <ol className="mt-12 grid gap-px overflow-hidden rounded-[24px] border border-line bg-line md:grid-cols-3">
              {[
                ["Shadow", "Novas técnicas rodam primeiro em modo sombra, comparadas com a resposta original."],
                ["Amostragem", "Uma fração configurável das requisições elegíveis é avaliada, para que a validação não consuma a economia."],
                ["Critérios", "Código: testes, linters e contratos. Agentes: critérios de resposta, tool use correto e consistência."],
                ["Fallback", "Falha, perda de qualidade ou latência acima do limite → requisição original segue (fallback_original)."],
                ["Rollback", "Regressão desativa a técnica no projeto e registra o motivo. Você pode reverter manualmente a qualquer momento."],
                ["Isolamento", "Tenants e projetos isolados. Proteção contra loops, chamadas duplicadas e retry storms."],
              ].map(([t, b], i) => (
                <Reveal as="li" key={t} delay={i * 0.04} className="bg-bg p-6">
                  <p className="font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-3 text-[18px] font-medium tracking-[-0.02em] text-fg">{t}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{b}</p>
                </Reveal>
              ))}
            </ol>
          </section>

          {/* Not claimed */}
          <section id="nao-afirmamos" aria-labelledby="na-t" className="scroll-mt-28">
            <Eyebrow index="07">O que não afirmamos</Eyebrow>
            <RevealText id="na-t" text="Honestidade também é método." className="mk-title mt-5 text-[clamp(2rem,4vw,3.4rem)] text-fg" />
            <ul className="mt-12 rounded-[24px] border border-error/20 bg-error/[0.03] p-6 sm:p-8">
              {notClaimed.map((n) => (
                <li key={n} className="flex gap-4 border-b border-line py-4 text-[15px] leading-relaxed text-muted first:pt-0 last:border-0 last:pb-0">
                  <span aria-hidden className="mt-[11px] h-px w-4 shrink-0 bg-error/70" />
                  <span>
                    <span className="sr-only">Não afirmamos: </span>
                    {n}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col items-start gap-6 rounded-[24px] border border-line bg-surface-1/40 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[22px] font-medium tracking-[-0.025em] text-fg">Comece em modo observação.</p>
              <p className="mt-1 text-[15px] text-muted">Meça sua carga real antes de decidir qualquer coisa.</p>
            </div>
            <ButtonLink href="/cadastro">Começar agora</ButtonLink>
          </div>
        </div>
      </Container>
    </>
  );
}
