#!/usr/bin/env node
/**
 * Case baseline from Claude Code transcripts (ORBIT step O — Observar).
 *
 * Reads the local JSONL transcripts Claude Code keeps per project, and produces AGGREGATES ONLY
 * (no prompt/response text ever leaves this script):
 *   - provider-reported usage per request (input, cache read, cache write 5m/1h, output), deduplicated
 *     by message id, per session and in total;
 *   - list-price cost computed with the ORBIT Engine price table (source: experimentally_estimated —
 *     a list-price computation, not an invoice; subscription plans are billed differently);
 *   - tool-use profile and an OFFLINE REPLAY of the real `compressToolOutput` over every Bash output
 *     ≥ 2,000 chars: what step R (Reduzir) would have removed. Claude has no public tokenizer, so these
 *     token counts are chars/3.6 estimates (flagged).
 *
 * Usage:
 *   node scripts/cases/claude-code-baseline.mjs [--dir <transcripts dir>] [--out <file.json>] [--until <ISO>]
 * Default dir: ~/.claude/projects/<cwd with / replaced by ->
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const engine = await import(join(root, "packages/orbit-engine/dist/index.js"));
const { compressToolOutput, costForUsage, estimateTokensHeuristic, PRICING_VERSION, ORBIT_ENGINE_VERSION } = engine;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const dir = args.dir ?? join(homedir(), ".claude/projects", process.cwd().replace(/[/.]/g, "-"));
const until = args.until ? Date.parse(args.until) : Infinity;
const since = args.since ? Date.parse(args.since) : -Infinity;
if (!existsSync(dir)) {
  console.error(`transcripts dir not found: ${dir}`);
  process.exit(1);
}

const BASH_MIN_CHARS = 2000;

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c?.type === "text" ? c.text ?? "" : "")).join("\n");
  return "";
}

const sessions = [];
const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
for (const f of files) {
  const s = {
    session: f.replace(/\.jsonl$/, "").slice(0, 8),
    first: null,
    last: null,
    models: {},
    requests: 0,
    inputTokens: 0, // uncached input
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    cost: { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    humanTurns: 0,
    tools: {},
    bash: { outputs: 0, large: 0, largeChars: 0, largeTokensEst: 0, compressible: 0, savedTokensEst: 0, steps: {} },
  };
  const byMsg = new Map(); // message id → usage (keep the final/max one)
  const toolNames = new Map();
  const rl = createInterface({ input: createReadStream(join(dir, f)), crlfDelay: Infinity });
  for await (const line of rl) {
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
    if (Number.isFinite(ts) && (ts > until || ts < since)) continue;
    if (Number.isFinite(ts)) {
      s.first = s.first === null ? ts : Math.min(s.first, ts);
      s.last = s.last === null ? ts : Math.max(s.last, ts);
    }
    const m = d.message;
    if (d.type === "assistant" && m) {
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c?.type === "tool_use") {
          toolNames.set(c.id, c.name);
          s.tools[c.name] = (s.tools[c.name] ?? 0) + 1;
        }
      }
      if (m.id && m.usage) {
        const prev = byMsg.get(m.id);
        if (!prev || (m.usage.output_tokens ?? 0) >= (prev.usage.output_tokens ?? 0)) byMsg.set(m.id, { usage: m.usage, model: m.model });
      }
    } else if (d.type === "user" && m && !d.isSidechain && !d.isMeta && (typeof m.content === "string" || (Array.isArray(m.content) && m.content.some((c) => c?.type === "text") && !m.content.some((c) => c?.type === "tool_result")))) {
      // a prompt typed by the person (not a tool result, not a subagent, not a system/meta injection)
      const t = typeof m.content === "string" ? m.content : textOf(m.content);
      // skip harness injections (slash-command echoes, reminders, notifications); pasted content still counts
      if (t.trim().length > 0 && !/^\s*<(command-|local-command|system-reminder|task-notification|bash-)/.test(t) && !t.startsWith("Caveat:")) s.humanTurns++;
    } else if (d.type === "user" && m && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c?.type !== "tool_result" || toolNames.get(c.tool_use_id) !== "Bash") continue;
        const text = textOf(c.content);
        s.bash.outputs++;
        if (text.length < BASH_MIN_CHARS) continue;
        s.bash.large++;
        s.bash.largeChars += text.length;
        const before = estimateTokensHeuristic(text);
        s.bash.largeTokensEst += before;
        const r = compressToolOutput(text, { model: "claude-opus-5-5" });
        // same gate as the real PostToolUse hook: ≥ 200 tokens and ≥ 15% saved
        if (r.applied && r.tokensSaved >= 200 && r.tokensSaved / Math.max(1, r.originalTokens) >= 0.15) {
          s.bash.compressible++;
          s.bash.savedTokensEst += r.tokensSaved;
          for (const st of r.steps) s.bash.steps[st] = (s.bash.steps[st] ?? 0) + 1;
        }
      }
    }
  }
  for (const { usage: u, model } of byMsg.values()) {
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const wAll = u.cache_creation_input_tokens ?? 0;
    const w5m = Math.max(0, wAll - w1h);
    const input = u.input_tokens ?? 0;
    const read = u.cache_read_input_tokens ?? 0;
    const out = u.output_tokens ?? 0;
    s.requests++;
    s.models[model] = (s.models[model] ?? 0) + 1;
    s.inputTokens += input;
    s.cacheReadTokens += read;
    s.cacheWrite5mTokens += w5m;
    s.cacheWrite1hTokens += w1h;
    s.outputTokens += out;
    const c = costForUsage(model ?? "", {
      inputTokens: input + read + wAll,
      cachedInputTokens: read,
      cacheWriteTokens: wAll,
      cacheWriteLongTokens: w1h,
      outputTokens: out,
      source: "provider_reported",
    });
    s.costMicros += c.priced ? c.cost.micros : 0;
    // component breakdown at the same list prices (micros)
    const pr = engine.findModelPrice(model ?? "");
    if (pr) {
      s.cost.uncached += input * pr.input;
      s.cost.cacheRead += read * pr.cachedInput;
      s.cost.cacheWrite += w5m * (pr.cacheWrite ?? pr.input) + w1h * (pr.cacheWriteLong ?? pr.cacheWrite ?? pr.input);
      s.cost.output += out * pr.output;
    }
  }
  if (s.requests > 0) sessions.push(s);
}

const sum = (k) => sessions.reduce((a, s) => a + s[k], 0);
const bsum = (k) => sessions.reduce((a, s) => a + s.bash[k], 0);
const tools = {};
for (const s of sessions) for (const [k, v] of Object.entries(s.tools)) tools[k] = (tools[k] ?? 0) + v;
const totalPrompt = sum("inputTokens") + sum("cacheReadTokens") + sum("cacheWrite5mTokens") + sum("cacheWrite1hTokens");

const report = {
  case: "case-000-maindy",
  generatedAt: new Date().toISOString(),
  method: {
    step: "O — Observar (baseline, nenhuma otimização ativa)",
    source: "Transcrições locais do Claude Code (campo usage da API Anthropic por resposta, deduplicado por message id)",
    tokensSource: "provider_reported",
    costSource: "experimentally_estimated (tokens × preço de lista da tabela ORBIT; não é fatura — planos de assinatura são cobrados de outra forma)",
    pricingVersion: PRICING_VERSION,
    engineVersion: ORBIT_ENGINE_VERSION,
    replay: `compressToolOutput real sobre saídas Bash ≥ ${BASH_MIN_CHARS} caracteres; mesmo gate do hook (≥200 tokens e ≥15%); tokens Claude estimados por caracteres/3,6`,
    privacy: "Somente agregados. Nenhum texto de prompt, resposta ou saída de ferramenta é gravado.",
  },
  period: {
    from: new Date(Math.min(...sessions.map((s) => s.first))).toISOString(),
    to: new Date(Math.max(...sessions.map((s) => s.last))).toISOString(),
    sessions: sessions.length,
  },
  totals: {
    requests: sum("requests"),
    promptTokens: totalPrompt,
    uncachedInputTokens: sum("inputTokens"),
    cacheReadTokens: sum("cacheReadTokens"),
    cacheWriteTokens: sum("cacheWrite5mTokens") + sum("cacheWrite1hTokens"),
    outputTokens: sum("outputTokens"),
    cacheReadShare: +(sum("cacheReadTokens") / Math.max(1, totalPrompt)).toFixed(4),
    listPriceUsd: +(sum("costMicros") / 1e6).toFixed(2),
    humanTurns: sum("humanTurns"),
    avgPromptTokensPerRequest: Math.round(totalPrompt / Math.max(1, sum("requests"))),
    requestsPerHumanTurn: +(sum("requests") / Math.max(1, sum("humanTurns"))).toFixed(1),
    listPriceUsdPerHumanTurn: +(sum("costMicros") / 1e6 / Math.max(1, sum("humanTurns"))).toFixed(2),
    costShare: (() => {
      const t = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
      for (const s of sessions) for (const k of Object.keys(t)) t[k] += s.cost[k];
      const all = Object.values(t).reduce((a, b) => a + b, 0) || 1;
      return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, +(v / all).toFixed(4)]));
    })(),
  },
  tools,
  bashReplay: {
    outputs: bsum("outputs"),
    largeOutputs: bsum("large"),
    largeOutputTokensEst: bsum("largeTokensEst"),
    compressibleOutputs: bsum("compressible"),
    savedTokensEst: bsum("savedTokensEst"),
    note: "Economia contada uma única vez por saída. Na prática cada saída volta como contexto (cache) nas chamadas seguintes da sessão; o efeito real tende a ser maior, mas só será declarado quando medido.",
  },
  sessions: sessions.map((s) => ({
    session: s.session,
    from: new Date(s.first).toISOString(),
    to: new Date(s.last).toISOString(),
    requests: s.requests,
    models: s.models,
    promptTokens: s.inputTokens + s.cacheReadTokens + s.cacheWrite5mTokens + s.cacheWrite1hTokens,
    cacheReadTokens: s.cacheReadTokens,
    cacheWriteTokens: s.cacheWrite5mTokens + s.cacheWrite1hTokens,
    outputTokens: s.outputTokens,
    listPriceUsd: +(s.costMicros / 1e6).toFixed(2),
    humanTurns: s.humanTurns,
    avgPromptTokensPerRequest: Math.round((s.inputTokens + s.cacheReadTokens + s.cacheWrite5mTokens + s.cacheWrite1hTokens) / Math.max(1, s.requests)),
    bash: s.bash,
  })),
};

if (args.out) {
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(resolve(args.out), JSON.stringify(report, null, 2) + "\n");
}
const nf = (n) => n.toLocaleString("pt-BR");
console.log(`case-000 · ${report.period.sessions} sessões · ${report.period.from.slice(0, 10)} → ${report.period.to.slice(0, 10)}`);
console.log(`requisições ${nf(report.totals.requests)} · prompt ${nf(totalPrompt)} tok (cache lido ${(report.totals.cacheReadShare * 100).toFixed(1)}%) · saída ${nf(report.totals.outputTokens)} tok`);
console.log(`custo a preço de lista ≈ US$ ${report.totals.listPriceUsd.toLocaleString("pt-BR")} · ${report.totals.humanTurns} pedidos humanos · US$ ${report.totals.listPriceUsdPerHumanTurn} por pedido · ${report.totals.requestsPerHumanTurn} req/pedido · contexto médio ${nf(report.totals.avgPromptTokensPerRequest)} tok/req`);
console.log(`quebra do custo: ${Object.entries(report.totals.costShare).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(" · ")}`);
console.log(`Bash: ${nf(report.bashReplay.outputs)} saídas · ${nf(report.bashReplay.largeOutputs)} grandes (~${nf(report.bashReplay.largeOutputTokensEst)} tok) · compressíveis ${nf(report.bashReplay.compressibleOutputs)} → ~${nf(report.bashReplay.savedTokensEst)} tok a menos (estimado)`);
