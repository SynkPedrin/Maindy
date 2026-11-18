/**
 * ORBIT benchmark — replays the same workloads through the gateway twice against REAL local Ollama:
 *   1) mode "observe"  (baseline: pure passthrough + measurement)
 *   2) mode "balanced" (exact_cache, loop_guard, retry_budget, tool_output_compression, context_dedup, prompt_cache_hints)
 * Tokens come from Ollama's own usage (prompt_eval_count/eval_count exposed as prompt_tokens/completion_tokens).
 * Money is a PRICE SIMULATION: measured tokens × list price (claude-sonnet-5-5, gpt-6.2-sol); Ollama itself costs 0.
 *
 *   pnpm --filter @maindy/gateway bench [-- --out ../../docs/evidence]
 */
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { RequestUsageEvent } from "@maindy/contracts";
import { costForUsage, defaultPolicy, PRICING_VERSION } from "@maindy/orbit-engine";
import { buildGateway } from "../src/server.js";
import { MODEL, workloads, type Workload } from "./workloads.js";

const OLLAMA = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const outArg = process.argv.indexOf("--out");
const OUT_DIR = resolve(outArg > 0 ? process.argv[outArg + 1]! : join(import.meta.dirname, "..", "..", "..", "docs", "evidence"));
const MODES = ["observe", "balanced"] as const;
type Mode = (typeof MODES)[number];
const CONTEXT_LIMIT = 4096;
/** previous run kept for the before/after table (docs/evidence) */
const PREVIOUS_RUN_FILE = "orbit-benchmark-run2-dedup-v1.json";

interface Row {
  workload: string;
  request: string;
  mode: Mode;
  httpStatus: number;
  eventStatus: string;
  cache: string;
  promptTokens: number;
  completionTokens: number;
  usageSource: string;
  latencyMs: number;
  techniques: { name: string; applied: boolean; tokensSaved: number; source: string }[];
  answer: string;
  assertion: string | null;
  passed: boolean | null;
  truncationSuspected: boolean;
}

async function ollamaInfo() {
  const version = ((await (await fetch(`${OLLAMA}/api/version`)).json()) as { version: string }).version;
  return { version };
}

async function warmup() {
  await fetch(`${OLLAMA}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: "ok" }], max_tokens: 1, reasoning_effort: "none" }),
  });
}

async function runMode(mode: Mode, wls: Workload[]): Promise<Row[]> {
  const home = mkdtempSync(join(tmpdir(), `maindy-bench-${mode}-`));
  writeFileSync(
    join(home, "policy.json"),
    JSON.stringify({ ...defaultPolicy(mode), qualitySampleRate: 0, cacheTtlSeconds: 3600 }),
    { mode: 0o600 },
  );
  const gw = buildGateway({
    home,
    quiet: true,
    timers: false,
    port: 0,
    configOverride: (c) => ({ ...c, upstreams: c.upstreams.map((u) => (u.id === "ollama" ? { ...u, baseUrl: OLLAMA } : u)) }),
  });
  const { url } = await gw.listen();
  const rows: Row[] = [];
  try {
    await warmup();
    for (const w of wls) {
      for (const r of w.requests) {
        const t0 = performance.now();
        const res = await fetch(`${url}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-maindy-project": `bench-${w.id}` },
          body: JSON.stringify(r.body),
        });
        const text = await res.text();
        const latencyMs = Math.round(performance.now() - t0);
        const eventId = res.headers.get("x-maindy-request-id") ?? "";
        let answer = "";
        try {
          answer = String((JSON.parse(text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "");
        } catch {
          answer = "";
        }
        await new Promise((r2) => setTimeout(r2, 20));
        const ev = gw.ctx.db.listEvents(1000).find((e: RequestUsageEvent) => e.eventId === eventId);
        const passed = r.assert ? r.assert.test(answer) : null;
        rows.push({
          workload: w.id,
          request: r.id,
          mode,
          httpStatus: res.status,
          eventStatus: ev?.status ?? "missing",
          cache: res.headers.get("x-maindy-cache") ?? "",
          promptTokens: ev?.usage.inputTokens ?? 0,
          completionTokens: ev?.usage.outputTokens ?? 0,
          usageSource: ev?.usage.source ?? "unavailable",
          latencyMs,
          techniques: (ev?.techniques ?? []).map((t) => ({ name: t.name, applied: t.applied, tokensSaved: t.tokensSaved, source: t.source })),
          answer: answer.slice(0, 200),
          assertion: r.assert?.description ?? null,
          passed,
          truncationSuspected: (ev?.usage.inputTokens ?? 0) >= CONTEXT_LIMIT - 64,
        });
        process.stdout.write(`[${mode}] ${w.id}/${r.id}: ${res.headers.get("x-maindy-cache")} in=${ev?.usage.inputTokens} out=${ev?.usage.outputTokens} ${latencyMs}ms ${passed === null ? "" : passed ? "PASS" : "FAIL"}\n`);
      }
    }
  } finally {
    await gw.close();
  }
  return rows;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};
const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round(((b - a) / b) * 1000) / 10);
const priceSim = (rows: Row[], model: string) =>
  sum(rows.map((r) => costForUsage(model, { inputTokens: r.promptTokens, outputTokens: r.completionTokens, cachedInputTokens: 0, cacheWriteTokens: 0, source: "provider_reported" }).cost.micros));

function summarize(wls: Workload[], rows: Row[]) {
  return wls.map((w) => {
    const per = (m: Mode) => {
      const rs = rows.filter((r) => r.workload === w.id && r.mode === m);
      return {
        requests: rs.length,
        promptTokens: sum(rs.map((r) => r.promptTokens)),
        completionTokens: sum(rs.map((r) => r.completionTokens)),
        totalTokens: sum(rs.map((r) => r.promptTokens + r.completionTokens)),
        latencyTotalMs: sum(rs.map((r) => r.latencyMs)),
        latencyMedianMs: median(rs.map((r) => r.latencyMs)),
        cacheHits: rs.filter((r) => r.cache === "hit").length,
        assertions: rs.filter((r) => r.passed !== null).length,
        assertionsPassed: rs.filter((r) => r.passed === true).length,
        gatewayEstimatedTokensSaved: sum(rs.flatMap((r) => r.techniques.filter((t) => t.applied && t.name !== "exact_cache").map((t) => t.tokensSaved))),
        techniquesApplied: [...new Set(rs.flatMap((r) => r.techniques.filter((t) => t.applied).map((t) => t.name)))],
        truncationSuspected: rs.some((r) => r.truncationSuspected),
        simUsdMicros: { "claude-sonnet-5-5": priceSim(rs, "claude-sonnet-5-5"), "gpt-6.2-sol": priceSim(rs, "gpt-6.2-sol") },
      };
    };
    const o = per("observe");
    const b = per("balanced");
    // cache-hit identity: in balanced mode each hit must equal the first answer for the same request body
    const balRows = rows.filter((r) => r.workload === w.id && r.mode === "balanced");
    const firstAnswer = new Map<string, string>();
    let hitIdentical = 0;
    let hitTotal = 0;
    for (const r of balRows) {
      const k = r.request.replace(/_round\d+$/, "");
      if (r.cache === "hit") {
        hitTotal++;
        if (firstAnswer.get(k) === r.answer) hitIdentical++;
      } else if (!firstAnswer.has(k)) firstAnswer.set(k, r.answer);
    }
    const obsRows = rows.filter((r) => r.workload === w.id && r.mode === "observe");
    const sameAnswerAsObserve = balRows.filter((r, i) => obsRows[i] && obsRows[i]!.answer === r.answer).length;
    return {
      workload: w.id,
      title: w.title,
      expectation: w.expectation,
      observe: o,
      balanced: b,
      reduction: {
        promptTokensPct: pct(b.promptTokens, o.promptTokens),
        totalTokensPct: pct(b.totalTokens, o.totalTokens),
        latencyTotalPct: pct(b.latencyTotalMs, o.latencyTotalMs),
      },
      quality: {
        cacheHitsIdentical: `${hitIdentical}/${hitTotal}`,
        assertionsObserve: `${o.assertionsPassed}/${o.assertions}`,
        assertionsBalanced: `${b.assertionsPassed}/${b.assertions}`,
        sameAnswerAsObserve: `${sameAnswerAsObserve}/${balRows.length}`,
      },
      priceSimulation: Object.fromEntries(
        (["claude-sonnet-5-5", "gpt-6.2-sol"] as const).map((m) => [
          m,
          { baselineUsdMicros: o.simUsdMicros[m], optimizedUsdMicros: b.simUsdMicros[m], savedUsdMicros: o.simUsdMicros[m] - b.simUsdMicros[m], savedPct: pct(b.simUsdMicros[m], o.simUsdMicros[m]) },
        ]),
      ),
    };
  });
}

/** Post-run analysis notes (explanations of observed behaviour; they do not change any number). */
const DIAGNOSES: Record<string, string> = {
  multiturn_duplicated_context:
    "na rodada 2 o documento repetido (~1.070 caracteres) ficou abaixo do limiar fixo de 1.200 caracteres do `context_dedup` v1 e nada foi substituído (0%). O `context_dedup` v2 mede o bloco repetido em tokens (mínimo 64) e casa linhas contíguas, então as cópias coladas de novo viram uma referência explícita à 1ª ocorrência. A carga e o documento não mudaram entre as rodadas.",
  repeated_deterministic_requests:
    "o ticket 1 (\"...charged twice for my subscription this month...\") contém \"this month\", que a regra de conteúdo dependente do tempo trata como dinâmico. Por isso as 3 repetições dele foram ao provedor. É um falso positivo conservador: na dúvida, a maindy não usa o cache.",
  coding_agent_tool_logs:
    "até a rodada 2 a contagem do gateway para modelos não-OpenAI era a regra de 3,6 caracteres/token, que subestimou a redução real destes logs (ANSI e spinners custam mais tokens) e, numa execução intermediária desta versão (3b), superestimou em 22% a do `context_dedup` no documento em português. Agora o gateway usa o o200k como proxy, que ficou 1–5% abaixo do medido pelo Ollama nas duas cargas. O ganho extra desta rodada vem das réguas decorativas longas do vitest (`⎯⎯⎯…[1/1]⎯`), presentes nas etapas 2 e 3.",
};

const usd = (micros: number) => `US$ ${(micros / 1_000_000).toFixed(6)}`;

function markdown(meta: Record<string, unknown>, summary: ReturnType<typeof summarize>, rows: Row[]): string {
  const L: string[] = [];
  L.push("# Benchmark ORBIT — evidência reproduzível", "");
  L.push(`> Gerado por \`pnpm --filter @maindy/gateway bench\` em ${meta.generatedAt}. Arquivo bruto: \`docs/evidence/orbit-benchmark.json\`.`, "");
  L.push("## Como foi medido", "");
  L.push(
    `- Mesmas requisições (geradas deterministicamente, \`temperature: 0\`) enviadas pelo gateway maindy. duas vezes contra **Ollama real** (\`${MODEL}\`, Ollama ${meta.ollamaVersion}, contexto ${CONTEXT_LIMIT} tokens): primeiro em modo **Observar** (linha de base, passthrough puro) e depois em modo **Equilibrado**. Cada modo usa um \`MAINDY_HOME\` novo (cache vazio).`,
    "- **Tokens**: os do próprio Ollama (`prompt_tokens`/`completion_tokens` = `prompt_eval_count`/`eval_count`), origem `provider_reported`. Em hit de cache o provedor não processa nada (0 tokens).",
    "- **Latência**: medida no cliente, ponta a ponta através do gateway.",
    "- **Qualidade**: asserções específicas da tarefa (ex.: o modelo ainda encontra o arquivo de teste que falhou) nos dois modos; hits de cache comparados byte a byte com a primeira resposta.",
    `- **Dinheiro = SIMULAÇÃO DE PREÇO**: tokens medidos × preço de lista (tabela \`${PRICING_VERSION}\`) de \`claude-sonnet-5-5\` e \`gpt-6.2-sol\`, sem prompt caching do provedor em nenhum dos lados. Os dois modelos têm o mesmo preço de lista (US$ 2 de entrada e US$ 10 de saída por 1M tokens), por isso as colunas coincidem. O Ollama em si custa US$ 0; nenhum valor abaixo foi cobrado de ninguém.`,
    "- Shadow sampling do Quality Guard desligado (`qualitySampleRate: 0`) para não misturar chamadas extras na contagem; a qualidade foi medida pelas asserções.",
    "",
  );
  L.push("## Resultado por carga de trabalho", "");
  L.push("| Carga | Req. | Tokens (Observar → Equilibrado) | Redução de tokens | Hits de cache | Latência total | Qualidade (asserções O / E) | Hits idênticos | Simulação Sonnet 5.5 | Simulação GPT-6.2 Sol |");
  L.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summary) {
    const sn = s.priceSimulation["claude-sonnet-5-5"]!;
    const gp = s.priceSimulation["gpt-6.2-sol"]!;
    L.push(
      `| ${s.title} | ${s.observe.requests} | ${s.observe.totalTokens} → ${s.balanced.totalTokens} | **${s.reduction.totalTokensPct}%** (entrada ${s.reduction.promptTokensPct}%) | ${s.balanced.cacheHits} | ${s.observe.latencyTotalMs} → ${s.balanced.latencyTotalMs} ms (${s.reduction.latencyTotalPct}%) | ${s.quality.assertionsObserve} / ${s.quality.assertionsBalanced} | ${s.quality.cacheHitsIdentical} | ${usd(sn.baselineUsdMicros)} → ${usd(sn.optimizedUsdMicros)} (${sn.savedPct}%) | ${usd(gp.baselineUsdMicros)} → ${usd(gp.optimizedUsdMicros)} (${gp.savedPct}%) |`,
    );
  }
  L.push("");
  const all = (m: Mode) => sum(summary.map((s) => s[m].totalTokens));
  const noCtl = (m: Mode) => sum(summary.filter((s) => s.workload !== "control_unique_short").map((s) => s[m].totalTokens));
  L.push(`**Total (todas as cargas):** ${all("observe")} → ${all("balanced")} tokens (${pct(all("balanced"), all("observe"))}%). **Sem o controle:** ${noCtl("observe")} → ${noCtl("balanced")} (${pct(noCtl("balanced"), noCtl("observe"))}%). O total depende da mistura de cargas escolhida aqui; não é uma promessa de economia para outro perfil de uso.`, "");
  L.push("## Leitura honesta", "");
  for (const s of summary) {
    L.push(`### ${s.title} (\`${s.workload}\`)`, "");
    L.push(`- Expectativa declarada antes de rodar: ${s.expectation}`);
    L.push(`- Técnicas efetivamente aplicadas no modo Equilibrado: ${s.balanced.techniquesApplied.length ? s.balanced.techniquesApplied.join(", ") : "nenhuma"}.`);
    L.push(`- Tokens de entrada medidos pelo Ollama: ${s.observe.promptTokens} → ${s.balanced.promptTokens} (${s.reduction.promptTokensPct}%); saída: ${s.observe.completionTokens} → ${s.balanced.completionTokens}.`);
    if (s.balanced.gatewayEstimatedTokensSaved > 0) {
      L.push(`- Estimativa do próprio gateway (o200k como proxy do tokenizador para modelos não-OpenAI): ${s.balanced.gatewayEstimatedTokensSaved} tokens removidos; diferença medida pelo provedor: ${s.observe.promptTokens - s.balanced.promptTokens}. A medida do provedor é a que vale.`);
    }
    L.push(`- Qualidade: asserções ${s.quality.assertionsObserve} (Observar) vs ${s.quality.assertionsBalanced} (Equilibrado); respostas idênticas às do modo Observar: ${s.quality.sameAnswerAsObserve}; hits de cache idênticos: ${s.quality.cacheHitsIdentical}.`);
    if (s.observe.truncationSuspected || s.balanced.truncationSuspected) L.push("- ⚠️ Prompt perto do limite de contexto do Ollama: possível truncamento — resultado não confiável.");
    const failures = rows.filter((r) => r.workload === s.workload && r.passed === false);
    if (failures.length) L.push(`- **Falhas de qualidade:** ${failures.map((f) => `${f.mode}/${f.request} (${f.assertion}; resposta: "${f.answer.replace(/\n/g, " ").slice(0, 80)}")`).join("; ")}.`);
    const fellBack = rows.filter((r) => r.workload === s.workload && r.mode === "balanced" && r.eventStatus === "fallback");
    if (fellBack.length) {
      L.push(`- Requisições em \`fallback_original\` (o motor passou do orçamento de latência ou falhou; o corpo ORIGINAL foi enviado, nada otimizado nelas): ${fellBack.map((r) => r.request).join(", ")}.`);
    }
    const bypassed = rows.filter((r) => r.workload === s.workload && r.mode === "balanced" && r.cache === "bypass");
    if (bypassed.length) L.push(`- Requisições em que o cache foi recusado (\`bypass\`): ${bypassed.map((r) => r.request).join(", ")}.`);
    if (Math.abs(s.reduction.totalTokensPct) < 2) {
      L.push(
        s.workload === "control_unique_short"
          ? "- Economia ~0, como esperado: não há redundância para remover, e o método não gera números do nada."
          : "- **Expectativa NÃO atendida**: economia ~0 nesta carga.",
      );
    }
    if (DIAGNOSES[s.workload]) L.push(`- Diagnóstico (análise pós-execução, sem alterar carga nem limiares): ${DIAGNOSES[s.workload]}`);
    L.push("");
  }
  L.push("## Requisição a requisição", "");
  L.push("| Modo | Carga / requisição | Cache | Entrada | Saída | Latência (ms) | Técnicas aplicadas | Asserção |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const t = r.techniques.filter((x) => x.applied).map((x) => `${x.name}(${x.tokensSaved})`).join(", ") || "—";
    L.push(`| ${r.mode} | ${r.workload}/${r.request} | ${r.cache} | ${r.promptTokens} | ${r.completionTokens} | ${r.latencyMs} | ${t} | ${r.passed === null ? "—" : r.passed ? "ok" : "FALHOU"} |`);
  }
  L.push("", "## Histórico de rodadas", "");
  L.push(
    "- **Rodada 1** (`orbit-benchmark-run1-coldstart.json`, mesmas cargas): no modo Equilibrado a 1ª requisição comprimível (`coding_agent_tool_logs/step1_install`) caiu em `fallback_original`. A primeira compressão num processo recém-iniciado (JIT) passou do orçamento de latência de 50 ms, e o corpo original foi enviado intacto, que é o comportamento fail-open esperado. Correção de engenharia: aquecimento do motor ao iniciar o gateway (`warmEngine()` em `apps/gateway/src/server.ts`), com texto sintético. As cargas não foram alteradas entre as rodadas. Nessa rodada a carga 1 teve redução de 36,8%.",
  );
  const prevPath = join(OUT_DIR, PREVIOUS_RUN_FILE);
  let prev: { meta: { generatedAt: string; commit: string }; summary: ReturnType<typeof summarize> } | null = null;
  try {
    prev = JSON.parse(readFileSync(prevPath, "utf8"));
  } catch {
    prev = null;
  }
  if (prev) {
    L.push(
      `- **Rodada 2** (\`${PREVIOUS_RUN_FILE}\`, ${prev.meta.generatedAt}, commit ${prev.meta.commit}): \`context_dedup\` v1 (limiar fixo de 1.200 caracteres), compressão sem colapso de linhas quase idênticas nem encurtamento de réguas decorativas. Mesmas cargas, mesmo modelo.`,
      "- **Rodada 3a** (`orbit-benchmark-run3a-fallback.json`, código desta rodada, mas ainda com a contagem não-OpenAI pela regra de caracteres): rodou com a máquina sob carga (outro processo pesado + arquivos de `node_modules` sendo rebaixados do iCloud). A requisição `coding_agent_tool_logs/step3_retry` passou do orçamento de 50 ms do motor e caiu em `fallback_original` (corpo original enviado, 0 economia nela; fail-open correto). Reproduzida isoladamente, a mesma otimização leva 0–2 ms. A rodada foi repetida com a máquina normal; os números abaixo e acima são dessa repetição. Na 3a, as demais requisições tiveram os mesmos tokens desta rodada.",
      "- **Rodada 3b** (`orbit-benchmark-run3b-char-estimate.json`): repetição com a máquina normal, ainda com a regra de 3,6 caracteres/token para estimar tokens não-OpenAI no gateway. Tokens medidos pelo Ollama e respostas idênticos aos desta rodada, requisição a requisição; só a estimativa do próprio gateway mudou (dedup: 774 estimados vs 633 medidos, +22%; logs: 2.106 vs 3.703, −43%). Por isso o gateway passou a usar o o200k como proxy.",
      "- **Esta rodada**: `context_dedup` v2 (limiar em tokens, linhas contíguas, referência explícita) + colapso de linhas que só diferem em horário/IDs + encurtamento de réguas decorativas longas.",
      "",
      "| Carga | Observar | Equilibrado (rodada 2) | Redução (rodada 2) | Equilibrado (esta) | Redução (esta) | Qualidade E (rodada 2 → esta) |",
      "|---|---|---|---|---|---|---|",
    );
    for (const s of summary) {
      const p = prev.summary.find((x) => x.workload === s.workload);
      if (!p) continue;
      L.push(`| ${s.title} | ${p.observe.totalTokens} / ${s.observe.totalTokens} | ${p.balanced.totalTokens} | ${p.reduction.totalTokensPct}% | ${s.balanced.totalTokens} | ${s.reduction.totalTokensPct}% | ${p.quality.assertionsBalanced} → ${s.quality.assertionsBalanced} |`);
    }
    const tot = (xs: ReturnType<typeof summarize>, m: Mode) => sum(xs.map((x) => x[m].totalTokens));
    L.push("", `Total: rodada 2 ${tot(prev.summary, "observe")} → ${tot(prev.summary, "balanced")} (${pct(tot(prev.summary, "balanced"), tot(prev.summary, "observe"))}%); esta rodada ${tot(summary, "observe")} → ${tot(summary, "balanced")} (${pct(tot(summary, "balanced"), tot(summary, "observe"))}%). A coluna Observar mostra "rodada 2 / esta" — é a mesma linha de base, medida de novo.`);
  } else {
    L.push("- **Esta rodada**: a tabela acima.");
  }
  L.push("", "## Limitações", "");
  L.push(
    `- Contexto do Ollama limitado a ${CONTEXT_LIMIT} tokens: as saídas de ferramenta foram dimensionadas para caber (senão o Ollama trunca o prompt silenciosamente e a comparação deixa de valer). Logs reais de agentes costumam ser muito maiores; nesse regime o passo de cabeça+cauda (só acima de 400 linhas) nem chegou a ser acionado aqui.`,
    "- Modelo local pequeno (4B) e uma única rodada por modo; as respostas são determinísticas (`temperature: 0`), mas a latência varia com o reaproveitamento de KV-cache do Ollama entre requisições consecutivas (afeta os dois modos).",
    "- Provedores reais têm prompt caching nativo (desconto em prefixos repetidos). A simulação de preço não aplica esse desconto em nenhum dos lados; com ele, a economia absoluta das cargas multi-turno seria menor. Descontos nativos nunca são contados como economia maindy.",
    "- A carga de controle existe para mostrar o caso em que o ORBIT não ajuda; ela entra no total.",
    "",
    "## Reproduzir",
    "",
    "```bash",
    "pnpm --filter @maindy/orbit-engine build && pnpm --filter @maindy/provider-adapters build",
    "pnpm --filter @maindy/gateway bench   # requer Ollama em 127.0.0.1:11434 com qwen3.5:4b",
    "```",
    "",
    `Ambiente: ${meta.platform}, ${meta.cpu}, Node ${meta.node}, commit ${meta.commit}.`,
  );
  return L.join("\n") + "\n";
}

async function main() {
  if (process.argv.includes("--report-only")) {
    // regenerate the markdown from the last JSON without re-running (same numbers)
    const prev = JSON.parse(readFileSync(join(OUT_DIR, "orbit-benchmark.json"), "utf8"));
    writeFileSync(join(OUT_DIR, "orbit-benchmark.md"), markdown(prev.meta, prev.summary, prev.rows));
    console.log("markdown regenerado a partir do JSON existente");
    return;
  }
  const info = await ollamaInfo().catch(() => null);
  if (!info) {
    console.error(`Ollama indisponível em ${OLLAMA}.`);
    process.exit(2);
  }
  const wls = workloads();
  const rows: Row[] = [];
  for (const m of MODES) rows.push(...(await runMode(m, wls)));
  const summary = summarize(wls, rows);
  let commit = "n/d";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  const meta = {
    generatedAt: new Date().toISOString(),
    ollamaVersion: info.version,
    model: MODEL,
    contextLimit: CONTEXT_LIMIT,
    pricingVersion: PRICING_VERSION,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "n/d",
    node: process.version,
    commit,
    note: "Money values are a PRICE SIMULATION over measured tokens; Ollama itself costs 0.",
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "orbit-benchmark.json"), `${JSON.stringify({ meta, summary, rows }, null, 2)}\n`);
  writeFileSync(join(OUT_DIR, "orbit-benchmark.md"), markdown(meta, summary, rows));
  console.log(`\nEscrito em ${OUT_DIR}/orbit-benchmark.{md,json}`);
  for (const s of summary) console.log(`${s.workload}: tokens ${s.observe.totalTokens} → ${s.balanced.totalTokens} (${s.reduction.totalTokensPct}%), qualidade O ${s.quality.assertionsObserve} / E ${s.quality.assertionsBalanced}, hits ${s.quality.cacheHitsIdentical}`);
}

await main();
