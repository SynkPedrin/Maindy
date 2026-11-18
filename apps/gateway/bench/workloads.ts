/**
 * Benchmark workloads. Generated deterministically (fixed seed) so both modes replay byte-identical
 * request sequences. Content is modeled on real tool outputs (npm, vitest, node stack traces) and real
 * chat behavior; it was NOT tuned to favour ORBIT — sizes are bounded only by the local runtime's
 * 4096-token context window (Ollama default for qwen3.5:4b), which we must not overflow (Ollama would
 * silently truncate the prompt and corrupt the comparison).
 */

export interface BenchRequest {
  /** label inside the workload */
  id: string;
  body: Record<string, unknown>;
  /** task-specific quality assertion on the assistant answer (null = no assertion) */
  assert: { description: string; test: (answer: string) => boolean } | null;
}

export interface Workload {
  id: string;
  title: string;
  /** what ORBIT is expected to do here — stated BEFORE running */
  expectation: string;
  requests: BenchRequest[];
}

export const MODEL = "qwen3.5:4b";
const COMMON = { model: MODEL, temperature: 0, max_tokens: 64, reasoning_effort: "none" };

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ESC = "\u001b";
const green = (s: string) => `${ESC}[32m${s}${ESC}[39m`;
const red = (s: string) => `${ESC}[31m${s}${ESC}[39m`;
const yellow = (s: string) => `${ESC}[33m${s}${ESC}[39m`;
const dim = (s: string) => `${ESC}[2m${s}${ESC}[22m`;

/* ------------------------------------------------------------------ */
/* Realistic tool outputs                                              */
/* ------------------------------------------------------------------ */

export function npmInstallLog(): string {
  const r = rng(7);
  const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const stages = ["idealTree:app: sill idealTree buildDeps", "reify:esbuild: timing reifyNode:node_modules/esbuild"];
  const lines: string[] = [];
  // npm redraws its progress line with \r — the terminal shows only the last state
  for (const st of stages) {
    const frames: string[] = [];
    for (let i = 0; i < 8; i++) frames.push(`${spinner[i % spinner.length]} ${st} ${Math.floor(r() * 900 + 100)}ms`);
    lines.push(frames.join("\r"));
  }
  const deprecated = [
    "inflight@1.0.6: This module is not supported, and leaks memory. Do not use it.",
    "glob@7.2.3: Glob versions prior to v9 are no longer supported",
    "rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported",
    "@humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead",
    "@humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead",
    "eslint@8.57.1: This version is no longer supported.",
    "abab@2.0.6: Use your platform's native atob() and btoa() methods instead",
    "domexception@4.0.0: Use your platform's native DOMException instead",
  ];
  for (const d of deprecated) lines.push(`${yellow("npm WARN")} ${dim("deprecated")} ${d}`);
  for (const pkg of ["vite@7.1.2", "jsdom@26.1.0"]) {
    lines.push(`${yellow("npm WARN")} EBADENGINE Unsupported engine {`);
    lines.push(`${yellow("npm WARN")} EBADENGINE   package: '${pkg}',`);
    lines.push(`${yellow("npm WARN")} EBADENGINE   required: { node: '^20.19.0 || >=22.12.0' },`);
    lines.push(`${yellow("npm WARN")} EBADENGINE   current: { node: 'v20.11.1', npm: '10.2.4' }`);
    lines.push(`${yellow("npm WARN")} EBADENGINE }`);
  }
  // npm prints this line once per locked directory it fails to clean up
  for (let i = 0; i < 14; i++) lines.push(`${yellow("npm WARN")} cleanup Failed to remove some directories [`);
  lines.push("", "added 412 packages, and audited 413 packages in 9s", "", "87 packages are looking for funding", "  run `npm fund` for details", "", `3 ${yellow("moderate")} severity vulnerabilities`, "", "To address all issues, run:", "  npm audit fix", "", "Run `npm audit` for details.");
  return lines.join("\n");
}

export function vitestLog(): string {
  const r = rng(11);
  const areas = ["utils", "cart", "auth", "catalog", "checkout", "orders"];
  const names = ["format", "parse", "validate", "client", "store", "hooks", "mapper", "router", "cache", "schema"];
  const lines: string[] = [`${ESC}[1m RUN ${ESC}[22m v3.2.4 /app`, ""];
  let n = 0;
  for (const a of areas) {
    for (const nm of names.slice(0, 4)) {
      n++;
      if (a === "cart" && nm === "format") {
        lines.push(` ${red("❯")} src/cart/discount.test.ts ${dim("(8 tests | 1 failed)")} 23ms`);
        lines.push(`   ${red("×")} applies coupon BLACKFRIDAY 5ms`);
        lines.push(`     ${red("→ expected 90 to be 81 // Object.is equality")}`);
        continue;
      }
      lines.push(` ${green("✓")} src/${a}/${nm}.test.ts ${dim(`(${Math.floor(r() * 12 + 2)} tests)`)} ${Math.floor(r() * 40 + 3)}ms`);
    }
  }
  lines.push(
    "",
    red("⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯"),
    "",
    ` ${red("FAIL")}  src/cart/discount.test.ts > applies coupon BLACKFRIDAY`,
    `${red("AssertionError")}: expected 90 to be 81 // Object.is equality`,
    "",
    green("- Expected"),
    red("+ Received"),
    "",
    green("- 81"),
    red("+ 90"),
    "",
    ` ${ESC}[36m❯ src/cart/discount.test.ts:42:31${ESC}[39m`,
    "     40|   it(\"applies coupon BLACKFRIDAY\", () => {",
    "     41|     const cart = makeCart([{ sku: \"A1\", price: 100 }]);",
    "     42|     expect(applyCoupon(cart, \"BLACKFRIDAY\").total).toBe(81);",
    "       |                               ^",
    "     43|   });",
    "",
    red("⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯"),
    "",
    ` Test Files  ${red("1 failed")} | ${green(`${n - 1} passed`)} (${n})`,
    `      Tests  ${red("1 failed")} | ${green("143 passed")} (144)`,
    `   Start at  14:02:11`,
    `   Duration  3.41s (transform 1.12s, setup 0ms, collect 2.80s, tests 412ms)`,
  );
  return lines.join("\n");
}

export function flakyRetryLog(): string {
  const stack = [
    "Error: connect ECONNREFUSED 127.0.0.1:5432",
    "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1607:16)",
    "    at Pool.connect (/app/node_modules/pg-pool/index.js:45:11)",
    "    at async Database.query (/app/src/db.ts:18:5)",
    "    at async CartRepository.load (/app/src/cart/repo.ts:31:17)",
    "    at async Context.<anonymous> (/app/src/cart/discount.test.ts:12:5)",
  ];
  const lines: string[] = ["> app@1.0.0 test:integration", "> vitest run --retry=2 src/cart", ""];
  for (let attempt = 1; attempt <= 3; attempt++) {
    lines.push(`[setup] attempt ${attempt}/3: connecting to postgres at 127.0.0.1:5432`);
    for (let i = 0; i < 6; i++) lines.push("[db] waiting for connection...");
    lines.push(...stack);
    lines.push(`[setup] attempt ${attempt} failed`, "");
  }
  lines.push(" FAIL  src/cart/discount.test.ts [ beforeAll ]", "Error: connect ECONNREFUSED 127.0.0.1:5432", " Test Files  1 failed (1)", "      Tests  no tests");
  return lines.join("\n");
}

const REFUND_DOC = [
  "Política de reembolso da Loja Exemplo (versão 3, vigente desde março).",
  "1. Prazo. O cliente pode solicitar reembolso integral em até 30 dias corridos após a entrega do produto, desde que o item esteja sem sinais de uso e na embalagem original.",
  "2. Produtos digitais. Licenças de software, cartões-presente e assinaturas já ativadas não são reembolsáveis, exceto quando houver defeito comprovado pelo suporte técnico.",
  "3. Forma de devolução. O reembolso é feito no mesmo meio de pagamento da compra: cartão de crédito em até duas faturas, Pix em até 5 dias úteis e boleto por transferência bancária.",
  "4. Frete. O frete de devolução é gratuito quando o produto chegou com defeito ou diferente do anunciado; nos demais casos, o custo do frete de devolução é do cliente.",
  "5. Exceções. Itens personalizados, produtos de higiene pessoal abertos e alimentos perecíveis não podem ser devolvidos, salvo defeito de fabricação.",
  "6. Atendimento. Pedidos de reembolso são feitos pelo formulário em /ajuda/reembolso; a análise leva até 3 dias úteis e o cliente recebe a resposta por e-mail.",
].join("\n\n");

/* ------------------------------------------------------------------ */
/* Workloads                                                           */
/* ------------------------------------------------------------------ */

const SYSTEM_AGENT = "You are a coding agent working in a Node.js repository. Use the tool outputs to answer precisely and briefly.";

function toolCall(id: string, cmd: string) {
  return { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "bash", arguments: JSON.stringify({ command: cmd }) } }] };
}

export function workloads(): Workload[] {
  const npm = npmInstallLog();
  const vt = vitestLog();
  const flaky = flakyRetryLog();

  const h1 = [
    { role: "system", content: SYSTEM_AGENT },
    { role: "user", content: "Set up the project and fix the failing test." },
    toolCall("call_1", "npm install"),
    { role: "tool", tool_call_id: "call_1", content: npm },
  ];
  const h2 = [
    ...h1,
    { role: "assistant", content: "The install finished: 412 packages added." },
    toolCall("call_2", "npm test"),
    { role: "tool", tool_call_id: "call_2", content: vt },
  ];
  const h3 = [
    ...h2,
    { role: "assistant", content: "The failing test is src/cart/discount.test.ts (applies coupon BLACKFRIDAY)." },
    toolCall("call_3", "npm run test:integration"),
    { role: "tool", tool_call_id: "call_3", content: flaky },
  ];

  const w1: Workload = {
    id: "coding_agent_tool_logs",
    title: "Agente de código com saídas de ferramenta grandes e repetitivas",
    expectation: "tool_output_compression reduz tokens de entrada (ANSI, redraws de progresso, linhas repetidas, stack traces idênticos); o modelo deve continuar achando as respostas.",
    requests: [
      { id: "step1_install", body: { ...COMMON, messages: [...h1, { role: "user", content: "How many packages were added? Reply with the number only." }] }, assert: { description: "responde 412", test: (a) => a.includes("412") } },
      { id: "step2_tests", body: { ...COMMON, messages: [...h2, { role: "user", content: "Which test file failed? Reply with the file path only." }] }, assert: { description: "acha src/cart/discount.test.ts", test: (a) => a.includes("discount.test.ts") } },
      { id: "step3_retry", body: { ...COMMON, messages: [...h3, { role: "user", content: "Why did the integration test setup fail? Reply with the error code only." }] }, assert: { description: "acha ECONNREFUSED", test: (a) => /ECONNREFUSED/i.test(a) } },
    ],
  };

  const classify = (text: string) => ({ ...COMMON, messages: [{ role: "system", content: "Classify the support ticket into exactly one label: billing, bug, feature_request, account. Reply with the label only." }, { role: "user", content: text }] });
  const tickets = [
    "I was charged twice for my subscription this month, please refund one of the charges.",
    "The export button crashes the app when the report has more than 1000 rows.",
    "It would be great to have dark mode in the mobile app.",
  ];
  const w2: Workload = {
    id: "repeated_deterministic_requests",
    title: "Agente que reenvia requisições determinísticas idênticas",
    expectation: "exact_cache serve as repetições localmente (0 tokens no provedor) com conteúdo idêntico ao original.",
    requests: [0, 1, 2].flatMap((round) =>
      tickets.map((t, i) => ({
        id: `ticket${i + 1}_round${round + 1}`,
        body: classify(t),
        assert: { description: "rótulo válido", test: (a: string) => /billing|bug|feature_request|account/i.test(a) },
      })),
    ),
  };

  const t1 = { role: "user", content: `Leia o documento abaixo.\n\n${REFUND_DOC}\n\nResuma em uma frase.` };
  const a1 = { role: "assistant", content: "A política permite reembolso em até 30 dias, com exceções para produtos digitais ativados, personalizados e perecíveis." };
  const t2 = { role: "user", content: "Quais meios de pagamento são citados?" };
  const a2 = { role: "assistant", content: "Cartão de crédito, Pix e boleto." };
  const t3 = { role: "user", content: `Vou colar de novo para garantir que você está olhando a versão certa:\n\n${REFUND_DOC}\n\nQual é o prazo de reembolso, em dias? Responda só o número.` };
  const a3 = { role: "assistant", content: "30" };
  const t4 = { role: "user", content: `Mais uma vez, o mesmo texto que meu colega mandou:\n\n${REFUND_DOC}\n\nEm quantos dias úteis o Pix é devolvido? Responda só o número.` };
  const sys = { role: "system", content: "Você é um assistente de atendimento. Responda em português, de forma curta." };
  const w3: Workload = {
    id: "multiturn_duplicated_context",
    title: "Chat multi-turno com o mesmo documento colado várias vezes",
    expectation: "context_dedup substitui as cópias repetidas do documento por uma referência à primeira; respostas devem continuar corretas.",
    requests: [
      { id: "turn1", body: { ...COMMON, messages: [sys, t1] }, assert: null },
      { id: "turn2", body: { ...COMMON, messages: [sys, t1, a1, t2] }, assert: { description: "cita Pix", test: (a) => /pix/i.test(a) } },
      { id: "turn3_dup", body: { ...COMMON, messages: [sys, t1, a1, t2, a2, t3] }, assert: { description: "responde 30", test: (a) => a.includes("30") } },
      { id: "turn4_dup2", body: { ...COMMON, messages: [sys, t1, a1, t2, a2, t3, a3, t4] }, assert: { description: "responde 5", test: (a) => /\b5\b|cinco/i.test(a) } },
    ],
  };

  const prompts: [string, (a: string) => boolean, string][] = [
    ["Translate to English: 'gato'. Reply with one word.", (a) => /cat/i.test(a), "cat"],
    ["What is 17 + 25? Reply with the number only.", (a) => a.includes("42"), "42"],
    ["Name the capital of Japan. One word.", (a) => /tokyo|tóquio/i.test(a), "Tokyo"],
    ["Is 91 a prime number? Answer yes or no.", (a) => /\bno\b|não/i.test(a), "no"],
    ["Write the chemical symbol for sodium.", (a) => /\bNa\b/.test(a), "Na"],
    ["Reverse the string 'abc'. Reply with the result only.", (a) => a.includes("cba"), "cba"],
  ];
  const w4: Workload = {
    id: "control_unique_short",
    title: "Controle: prompts curtos e únicos (ORBIT não deve ajudar)",
    expectation: "nenhuma técnica se aplica (sem repetição, sem saídas de ferramenta, sem duplicação): economia ~0. Serve para mostrar que o método não infla números.",
    requests: prompts.map(([p, test, expected], i) => ({
      id: `unique${i + 1}`,
      body: { ...COMMON, messages: [{ role: "user", content: p }] },
      assert: { description: `responde ${expected}`, test },
    })),
  };

  return [w1, w2, w3, w4];
}
