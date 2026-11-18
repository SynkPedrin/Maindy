import { compressToolOutput, countTokens, dedupeContext, ORBIT_ENGINE_VERSION, promptHash, type TextSlot } from "@maindy/orbit-engine";

/**
 * SERVER ONLY (imports node:crypto via the engine). Landing-page demo data, produced by the REAL ORBIT Engine on fixed sample inputs at render time
 * (server side). Nothing here is a hand-typed number: token counts come from the engine's local
 * tokenizer (o200k_base for OpenAI-family models → "medido localmente").
 */
export type DemoRun = {
  id: "logs" | "dedup" | "cache";
  label: string;
  ask: string;
  technique: string;
  steps: string[];
  before: number;
  after: number;
  method: string;
  beforePreview: string[];
  afterPreview: string[];
  note: string;
};

export type OrbitDemoData = { engineVersion: string; model: string; runs: DemoRun[] };

const MODEL = "gpt-4.1-mini";

const STEP_LABEL: Record<string, string> = {
  strip_ansi: "Remove códigos de cor ANSI",
  carriage_returns: "Resolve barras de progresso (\\r)",
  collapse_repeats: "Colapsa linhas repetidas",
  dedupe_stack_traces: "Deduplica stack traces",
  head_tail: "Mantém início, fim e linhas com erro",
};

function testRunLog(): string {
  const out: string[] = [];
  const esc = "\u001b[";
  out.push(`${esc}1m> app@2.4.0 test${esc}22m`, `${esc}2m> vitest run --reporter=verbose${esc}22m`, "");
  for (let i = 0; i <= 100; i += 2) out.push(`\r${esc}36mtransforming${esc}39m (${i}%) src/modules/billing/invoice.ts`);
  const modules = ["auth", "billing", "orders", "catalog", "search", "users", "reports", "notifications"];
  for (let m = 0; m < modules.length; m++) {
    for (let t = 0; t < 52; t++) {
      out.push(`${esc}32m ✓${esc}39m src/modules/${modules[m]}/${modules[m]}.service.test.ts > ${modules[m]} service > case ${t + 1} ${esc}2m(${(t * 7) % 23}ms)${esc}22m`);
    }
    for (let w = 0; w < 9; w++) out.push(`${esc}33m(node:4412) Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0' is insecure.${esc}39m`);
  }
  const trace = [
    `${esc}31m FAIL${esc}39m src/modules/billing/invoice.test.ts > invoice > applies discount once`,
    "AssertionError: expected 90 to be 81",
    "    at Object.<anonymous> (src/modules/billing/invoice.test.ts:48:23)",
    "    at runTest (node_modules/vitest/dist/runner.js:812:11)",
    "    at runSuite (node_modules/vitest/dist/runner.js:930:15)",
    "    at runFiles (node_modules/vitest/dist/runner.js:1001:5)",
    "    at processTicksAndRejections (node:internal/process/task_queues:95:5)",
  ];
  for (let r = 0; r < 14; r++) out.push(...trace, "");
  out.push(`${esc}31m Test Files  1 failed${esc}39m | 8 passed (9)`, `${esc}31m      Tests  14 failed${esc}39m | 416 passed (430)`, "   Duration  7.84s");
  return out.join("\n");
}

function sourceFile(): string {
  const lines = [
    "// src/modules/billing/invoice.ts",
    "import { Money, type Currency } from '../shared/money';",
    "import { type Discount, applyDiscount } from './discount';",
    "",
    "export interface InvoiceLine { sku: string; quantity: number; unitPrice: Money; }",
    "",
    "/** Builds an invoice total. Discounts are applied once, after taxes, never per line. */",
    "export function invoiceTotal(lines: InvoiceLine[], currency: Currency, discount?: Discount): Money {",
    "  let total = Money.zero(currency);",
    "  for (const line of lines) {",
    "    if (line.quantity <= 0) throw new Error(`invalid quantity for ${line.sku}`);",
    "    total = total.add(line.unitPrice.multiply(line.quantity));",
    "  }",
    "  const taxed = total.multiply(1 + taxRate(currency));",
    "  return discount ? applyDiscount(taxed, discount) : taxed;",
    "}",
    "",
    "function taxRate(currency: Currency): number {",
    "  switch (currency) {",
    "    case 'BRL': return 0.0925;",
    "    case 'USD': return 0.0;",
    "    default: return 0.2;",
    "  }",
    "}",
  ];
  const para: string[] = [];
  // paragraphs (blank-line separated) so the dedup works on real block boundaries
  for (let i = 0; i < 4; i++) para.push(lines.join("\n").replace("invoice.ts", i === 0 ? "invoice.ts" : `invoice.part${i}.ts`));
  return para.join("\n\n");
}

function makeSlots(texts: { kind: TextSlot["kind"]; text: string }[]): TextSlot[] {
  return texts.map((t, i) => {
    const slot: TextSlot = {
      messageIndex: i,
      kind: t.kind,
      text: t.text,
      set(next: string) {
        slot.text = next;
      },
    };
    return slot;
  });
}

function preview(text: string, n: number): string[] {
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .slice(0, n)
    .map((l) => (l.length > 110 ? `${l.slice(0, 107)}…` : l));
}

let cached: OrbitDemoData | null = null;

export function getOrbitDemo(): OrbitDemoData {
  if (cached) return cached;
  const runs: DemoRun[] = [];

  // 1 — compress a noisy tool output (what coding agents paste back into context)
  const log = testRunLog();
  const c = compressToolOutput(log, { model: MODEL });
  runs.push({
    id: "logs",
    label: "Saída de testes",
    ask: "Rode os testes e me diga o que quebrou.",
    technique: "Compressão segura de saída de ferramenta",
    steps: c.steps.map((s) => STEP_LABEL[s] ?? s),
    before: c.originalTokens,
    after: c.compressedTokens,
    method: "o200k_base · medido localmente",
    // strip ANSI for display only
    beforePreview: preview(log.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, ""), 9),
    afterPreview: preview(c.text, 9),
    note: "As linhas com erro, o início e o fim são preservados; o que sai é ruído repetido.",
  });

  // 2 — the same file pasted again into the conversation
  const file = sourceFile();
  const slots = makeSlots([
    { kind: "system", text: `Você é um agente de código. Contexto do repositório:\n\n${file}` },
    { kind: "user", text: `Segue o arquivo de novo para você ver:\n\n${file}\n\nPor que o desconto é aplicado duas vezes?` },
  ]);
  const beforeText = slots.map((s) => s.text).join("\n\n");
  const before = countTokens(beforeText, MODEL).tokens;
  const d = dedupeContext(slots, { model: MODEL });
  const afterText = slots.map((s) => s.text).join("\n\n");
  runs.push({
    id: "dedup",
    label: "Arquivo repetido",
    ask: "Segue o arquivo de novo: por que o desconto é aplicado duas vezes?",
    technique: "Deduplicação de contexto",
    steps: d.blocksReplaced > 0 ? [`${d.blocksReplaced} bloco(s) idêntico(s) trocado(s) por referência ao original`] : ["Nenhum bloco repetido acima do limite"],
    before,
    after: countTokens(afterText, MODEL).tokens,
    method: "o200k_base · medido localmente",
    beforePreview: preview(slots[1] ? `${file.split("\n").slice(0, 6).join("\n")}` : "", 6),
    afterPreview: preview(slots[1]!.text, 6),
    note: "O conteúdo continua disponível na primeira ocorrência; só a cópia sai.",
  });

  // 3 — the identical request, twice (exact cache, isolated per project)
  const body = { model: MODEL, messages: [{ role: "user", content: "Resuma em 3 linhas o README do projeto billing." }] };
  const h1 = promptHash("openai_chat", body);
  const h2 = promptHash("openai_chat", JSON.parse(JSON.stringify(body)));
  const reqTokens = countTokens(JSON.stringify(body.messages), MODEL).tokens;
  runs.push({
    id: "cache",
    label: "Pergunta repetida",
    ask: "Resuma em 3 linhas o README do projeto billing. (de novo)",
    technique: "Cache exato com isolamento por projeto",
    steps: [h1 === h2 ? "Mesma impressão digital da requisição (SHA-256)" : "Requisições diferentes: sem cache", "Resposta servida localmente, sem nova chamada ao provedor"],
    before: reqTokens,
    after: h1 === h2 ? 0 : reqTokens,
    method: "o200k_base · medido localmente",
    beforePreview: [`hash ${h1.slice(0, 16)}…`, "→ provedor"],
    afterPreview: [`hash ${h2.slice(0, 16)}…`, "→ cache local (0 tokens enviados)"],
    note: "Só vale para requisições idênticas, quando a política do projeto permite cache.",
  });

  cached = { engineVersion: ORBIT_ENGINE_VERSION, model: MODEL, runs };
  return cached;
}
