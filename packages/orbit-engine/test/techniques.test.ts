import { describe, expect, it } from "vitest";
import {
  cacheKey,
  canonicalJson,
  decideCache,
  isStorableResponse,
  MemoryCacheStore,
  promptHash,
} from "../src/techniques/cache.js";
import { collapseNearDuplicateLines, collapseRepeatedLines, compressToolOutput, dedupeStackTraces, resolveCarriageReturns, shortenRules, stripAnsi } from "../src/techniques/compression.js";
import { dedupeContext } from "../src/techniques/dedup.js";
import { LoopGuard, RetryBudget } from "../src/techniques/guards.js";
import { applyModelRouting, applyOutputBudget, applyPromptCacheHints } from "../src/techniques/body.js";
import type { TextSlot } from "../src/types.js";

function slots(texts: { kind: TextSlot["kind"]; text: string }[]): TextSlot[] {
  return texts.map((t, i) => {
    const s: TextSlot = { messageIndex: i, kind: t.kind, text: t.text, set: (v) => ((s.text = v), (texts[i]!.text = v)) };
    return s;
  });
}

describe("exact cache", () => {
  const body = { model: "gpt-6.2-sol", messages: [{ role: "user", content: "hi" }], temperature: 0 };

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });

  it("promptHash ignores non-semantic fields but not semantic ones", () => {
    const h = promptHash("openai_chat", body);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(promptHash("openai_chat", { ...body, stream: true, stream_options: { include_usage: true }, user: "u1" })).toBe(h);
    expect(promptHash("openai_chat", { ...body, temperature: 0.5 })).not.toBe(h);
    expect(promptHash("openai_chat", { ...body, tools: [{ type: "function", function: { name: "x" } }] })).not.toBe(h);
    expect(promptHash("anthropic_messages", body)).not.toBe(h);
  });

  it("cache key isolates tenant, project, upstream and stream", () => {
    const h = promptHash("openai_chat", body);
    const k = cacheKey({ tenant: "t1", project: "p1", upstream: "openai" }, "openai_chat", false, h);
    expect(cacheKey({ tenant: "t2", project: "p1", upstream: "openai" }, "openai_chat", false, h)).not.toBe(k);
    expect(cacheKey({ tenant: "t1", project: "p2", upstream: "openai" }, "openai_chat", false, h)).not.toBe(k);
    expect(cacheKey({ tenant: "t1", project: "p1", upstream: "ollama" }, "openai_chat", false, h)).not.toBe(k);
    expect(cacheKey({ tenant: "t1", project: "p1", upstream: "openai" }, "openai_chat", true, h)).not.toBe(k);
  });

  const base = { active: true, format: "openai_chat" as const, body, stream: false, noCacheHeader: false, promptText: "hi" };
  it("eligible for deterministic requests", () => {
    expect(decideCache(base)).toEqual({ eligible: true, status: "miss" });
  });
  it("disabled when technique inactive", () => {
    expect(decideCache({ ...base, active: false }).status).toBe("disabled");
  });
  it("bypass rules", () => {
    expect(decideCache({ ...base, noCacheHeader: true })).toMatchObject({ status: "bypass", reason: "x-maindy-no-cache" });
    expect(decideCache({ ...base, body: { ...body, temperature: 0.7 } })).toMatchObject({ status: "bypass" });
    expect(decideCache({ ...base, body: { model: "x", messages: [] } })).toMatchObject({ status: "bypass", reason: expect.stringContaining("unset") });
    expect(decideCache({ ...base, body: { ...body, temperature: 0.7 }, options: { allowNonDeterministic: true } }).eligible).toBe(true);
    expect(decideCache({ ...base, stream: true, options: { allowStreaming: false } })).toMatchObject({ status: "bypass" });
    expect(decideCache({ ...base, stream: true }).eligible).toBe(true);
    expect(decideCache({ ...base, body: { ...body, n: 3 } }).status).toBe("bypass");
    expect(decideCache({ ...base, body: { ...body, tools: [{ type: "function", function: { name: "send_email" } }] } })).toMatchObject({ reason: "tool with side effects" });
    expect(decideCache({ ...base, body: { ...body, tools: [{ name: "delete_file", input_schema: {} }] } }).status).toBe("bypass");
    expect(decideCache({ ...base, body: { ...body, tools: [{ type: "function", function: { name: "lookup_city" } }] } }).eligible).toBe(true);
    expect(decideCache({ ...base, body: { ...body, tools: [{ type: "web_search" }] } }).status).toBe("bypass");
    expect(decideCache({ ...base, promptText: "What time is it now?" })).toMatchObject({ reason: "time-dependent content" });
    expect(decideCache({ ...base, promptText: "qual a cotação de hoje?" }).status).toBe("bypass");
    expect(decideCache({ ...base, promptText: "knowledge is power" }).eligible).toBe(true);
  });

  it("memory store honors TTL and purge", () => {
    const store = new MemoryCacheStore();
    const usage = { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, source: "provider_reported" as const };
    store.set({ key: "k", tenant: "t", project: null, createdAt: 0, expiresAt: 100, model: "m", provider: "p", stream: false, status: 200, contentType: "application/json", body: "{}", usage });
    expect(store.get("k", 50)?.body).toBe("{}");
    expect(store.get("k", 100)).toBeNull();
    store.set({ key: "k2", tenant: "t", project: null, createdAt: 0, expiresAt: 10, model: "m", provider: "p", stream: false, status: 200, contentType: "x", body: "{}", usage });
    expect(store.purgeExpired(20)).toBe(1);
    expect(isStorableResponse(200, "{}", usage)).toBe(true);
    expect(isStorableResponse(500, "{}", usage)).toBe(false);
    expect(isStorableResponse(200, "{}", { ...usage, source: "unavailable" })).toBe(false);
  });
});

describe("tool_output_compression", () => {
  it("leaves small outputs untouched", () => {
    const r = compressToolOutput("ok\n".repeat(10));
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("below size threshold");
  });

  it("never alters a JSON payload", () => {
    const json = JSON.stringify({ items: Array.from({ length: 300 }, (_, i) => ({ i, v: "same same same" })) }, null, 2);
    const r = compressToolOutput(json);
    expect(r.applied).toBe(false);
    expect(r.text).toBe(json);
    expect(r.reason).toBe("json payload preserved");
  });

  it("strips ANSI and resolves carriage-return progress bars", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
    expect(resolveCarriageReturns("10%\r50%\r100%\nnext")).toBe("100%\nnext");
    expect(resolveCarriageReturns("a\r\nb")).toBe("a\nb");
  });

  it("collapses repeated lines with an explicit count (lossless)", () => {
    expect(collapseRepeatedLines(["a", "x", "x", "x", "x", "b"])).toEqual(["a", "x", "[maindy: linha acima repetida mais 3×]", "b"]);
    expect(collapseRepeatedLines(["x", "x", "y"])).toEqual(["x", "x", "y"]);
  });

  it("dedupes identical stack traces", () => {
    const trace = ["    at foo (a.js:1:1)", "    at bar (b.js:2:2)", "    at baz (c.js:3:3)"];
    const out = dedupeStackTraces(["Error: one", ...trace, "Error: two", ...trace]);
    expect(out).toEqual(["Error: one", ...trace, "Error: two", "[maindy: stack trace idêntico ao #1 omitido (3 linhas)]"]);
  });

  it("compresses a noisy log, keeping head, tail and errors with an omission marker", () => {
    const lines: string[] = [];
    for (let i = 0; i < 2000; i++) lines.push(`\u001b[32m✓\u001b[0m test case number ${i} passed in ${i % 7}ms`);
    lines.splice(1000, 0, "FAIL src/thing.test.ts > breaks: Error: expected 1 to be 2");
    const input = lines.join("\n");
    const r = compressToolOutput(input, { model: "gpt-6.2-sol" });
    expect(r.applied).toBe(true);
    expect(r.steps).toEqual(expect.arrayContaining(["strip_ansi", "head_tail"]));
    expect(r.text).toContain("test case number 0 passed");
    expect(r.text).toContain("test case number 1999 passed");
    expect(r.text).toContain("FAIL src/thing.test.ts > breaks");
    expect(r.text).toMatch(/\[maindy: \d+ linhas omitidas\]/);
    expect(r.tokensSaved).toBeGreaterThan(0);
    expect(r.originalTokens - r.compressedTokens).toBe(r.tokensSaved);
    expect(r.source).toBe("locally_measured");
  });

  it("never changes fenced code blocks", () => {
    const code = "```ts\n" + "const x = 1;\n".repeat(50) + "```";
    const noise = "same line\n".repeat(400);
    const r = compressToolOutput(noise + code + "\n" + noise);
    expect(r.applied).toBe(true);
    expect(r.text).toContain(code);
    expect(r.steps).not.toContain("head_tail");
  });

  it("returns original when savings are below the ratio", () => {
    const text = Array.from({ length: 300 }, (_, i) => `unique line ${i} ${"x".repeat(10)}`).join("\n");
    const r = compressToolOutput(text);
    expect(r.applied).toBe(false);
    expect(r.text).toBe(text);
  });
});

describe("tool_output_compression — near-duplicate lines and decorative rules", () => {
  it("collapses lines that differ only in timestamps/ids, keeping first and last verbatim", () => {
    const hb = Array.from({ length: 30 }, (_, i) => `2026-11-18T10:00:${String(i).padStart(2, "0")}.${100 + i}Z INFO worker heartbeat ok trace=${(0x3f2a9c1e4b00 + i).toString(16)}`);
    const out = collapseNearDuplicateLines(["boot", ...hb, "2026-11-18T10:00:31.000Z ERROR worker crashed: out of memory"]);
    expect(out).toEqual(["boot", hb[0], "[maindy: mais 28 linhas iguais à de cima, mudando só horário/IDs]", hb[29], "2026-11-18T10:00:31.000Z ERROR worker crashed: out of memory"]);
  });
  it("never collapses lines whose other values differ (data rows, counters) or short runs", () => {
    const rows = ["balance: 100", "balance: 90", "balance: 80", "balance: 70", "balance: 60"];
    expect(collapseNearDuplicateLines(rows)).toEqual(rows);
    const three = ["10:00:01 poll queue=jobs empty", "10:00:02 poll queue=jobs empty", "10:00:03 poll queue=jobs empty"];
    expect(collapseNearDuplicateLines(three)).toEqual(three);
    const status = ["10:00:01 GET /health 200", "10:00:02 GET /health 200", "10:00:03 GET /health 500", "10:00:04 GET /health 200", "10:00:05 GET /health 200"];
    expect(collapseNearDuplicateLines(status)).toEqual(status);
  });
  it("shortens long decorative rules only when they start the line", () => {
    expect(shortenRules(["⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯", "========== 3 failed, 10 passed in 2.1s ==========", "  ------------"])).toEqual([
      "⎯⎯⎯[1/1]⎯",
      "=== 3 failed, 10 passed in 2.1s ===",
      "  ---",
    ]);
    const keep = ["[=====>    ] 50%", "|------|-----|", "a ---------- b", "=======", "████████░░░░ 66%"];
    expect(shortenRules(keep)).toEqual(keep);
  });
  it("is used by compressToolOutput on a polling log (but never inside fenced code)", () => {
    const poll = Array.from({ length: 120 }, (_, i) => `[2026-11-18 10:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}] waiting for deployment rollout to finish (request ${crypto.randomUUID()})`).join("\n");
    const r = compressToolOutput(`${poll}\ndeployment ready`);
    expect(r.applied).toBe(true);
    expect(r.steps).toContain("collapse_near_duplicates");
    expect(r.text.split("\n")).toHaveLength(4);
    expect(r.text.endsWith("deployment ready")).toBe(true);
    const fenced = "```\n" + poll + "\n```";
    expect(compressToolOutput(fenced).text).toBe(fenced);
  });
});

describe("context_dedup", () => {
  const big = "Lorem ipsum dolor sit amet. ".repeat(80);
  const MARK = (where: string) => new RegExp(`^\\[maindy: conteúdo idêntico ${where}, omitido \\(~\\d+ tokens; começa com "[^"]+"\\)\\]$`);
  it("keeps the first occurrence and references later ones", () => {
    const s = slots([
      { kind: "user", text: big },
      { kind: "assistant", text: "ok" },
      { kind: "user", text: `${big}\n\nnew question` },
    ]);
    const r = dedupeContext(s, { model: "gpt-6.2-sol" });
    expect(r.blocksReplaced).toBe(1);
    expect(s[0]!.text).toBe(big);
    const [marker, blank, q] = s[2]!.text.split("\n");
    expect(marker).toMatch(MARK("ao da mensagem #1 acima"));
    expect(marker).toContain('começa com "Lorem ipsum dolor sit amet. Lorem ipsum dolor sit amet.…"');
    expect([blank, q]).toEqual(["", "new question"]);
    expect(r.tokensRemoved).toBeGreaterThan(100);
    expect(r.application).toMatchObject({ name: "context_dedup", applied: true, source: "locally_measured" });
  });
  it("never edits the system prompt or assistant messages; references the system prompt as a source", () => {
    const s = slots([
      { kind: "system", text: big },
      { kind: "user", text: big },
      { kind: "assistant", text: big },
      { kind: "user", text: "short\n\nshort" },
    ]);
    const r = dedupeContext(s);
    expect(s[0]!.text).toBe(big);
    expect(s[1]!.text).toMatch(MARK("ao das instruções do sistema"));
    expect(s[2]!.text).toBe(big);
    expect(s[3]!.text).toBe("short\n\nshort");
    expect(r.application.source).toBe("experimentally_estimated");
  });
  it("replaces a multi-paragraph document pasted again (one marker, separators kept)", () => {
    const doc = Array.from({ length: 8 }, (_, i) => `Cláusula ${i + 1}: ` + "o cliente pode solicitar reembolso conforme as regras desta seção. ".repeat(3)).join("\n\n");
    const s = slots([
      { kind: "user", text: `Leia:\n\n${doc}\n\nResuma.` },
      { kind: "assistant", text: "Resumo curto." },
      { kind: "user", text: `Colando de novo:\n\n${doc}\n\nQual o prazo?` },
    ]);
    const r = dedupeContext(s);
    expect(r.blocksReplaced).toBe(1);
    const lines = s[2]!.text.split("\n");
    expect(lines[0]).toBe("Colando de novo:");
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(MARK("ao da mensagem #1 acima"));
    expect(lines.slice(3)).toEqual(["", "Qual o prazo?"]);
    expect(s[0]!.text).toContain(doc);
  });
  it("catches a ~1.000-character document with short paragraphs (the benchmark case that the old 1.200-char floor missed)", () => {
    const doc = [
      "Política de reembolso da Loja Exemplo (versão 3, vigente desde março).",
      "1. Prazo. O cliente pode solicitar reembolso integral em até 30 dias corridos após a entrega do produto.",
      "2. Produtos digitais. Licenças de software e assinaturas já ativadas não são reembolsáveis.",
      "3. Forma de devolução. Cartão de crédito em até duas faturas, Pix em até 5 dias úteis e boleto por transferência.",
      "4. Frete. O frete de devolução é gratuito quando o produto chegou com defeito.",
      "5. Exceções. Itens personalizados e alimentos perecíveis não podem ser devolvidos.",
    ].join("\n\n");
    expect(doc.length).toBeLessThan(1200);
    for (const model of [null, "gpt-6.2-sol"]) {
      const s = slots([
        { kind: "system", text: "Você é um assistente." },
        { kind: "user", text: `Leia o documento abaixo.\n\n${doc}\n\nResuma.` },
        { kind: "assistant", text: "Resumo." },
        { kind: "user", text: `De novo, para conferir:\n\n${doc}\n\nQual o prazo?` },
      ]);
      const r = dedupeContext(s, { model });
      expect(r.blocksReplaced, String(model)).toBe(1);
      expect(s[3]!.text).toContain('[maindy: conteúdo idêntico ao da mensagem #2 acima, omitido');
      expect(s[3]!.text).toContain('começa com "Política de reembolso da Loja Exemplo (versão 3, vigente…"');
      expect(s[3]!.text.endsWith("\n\nQual o prazo?")).toBe(true);
    }
  });
  it("threshold is in tokens (adaptive to the content), not characters", () => {
    // ~same number of characters, very different token counts
    const prose = "O cliente pode pedir reembolso em até trinta dias após a entrega do produto. ".repeat(3).trim();
    const ids = Array.from({ length: 6 }, (_, i) => `0f${i}e7c2a-9b1d-4c3e-8f5a-2d6b7c8e9f${i}a`).join(" ");
    expect(Math.abs(prose.length - ids.length)).toBeLessThan(40);
    const twice = (t: string) => slots([{ kind: "user", text: t }, { kind: "user", text: t }]);
    expect(dedupeContext(twice(prose)).blocksReplaced).toBe(0); // < 64 tokens
    expect(dedupeContext(twice(ids)).blocksReplaced).toBe(1); // ≥ 64 tokens
    expect(dedupeContext(twice("x".repeat(300))).blocksReplaced).toBe(0); // 300 chars, few tokens
    const short = "Repita a resposta anterior, por favor, com mais detalhes.";
    expect(dedupeContext(twice(short)).blocksReplaced).toBe(0);
    expect(dedupeContext(slots([{ kind: "user", text: big }, { kind: "user", text: big }]), { minBlockTokens: 10_000 }).blocksReplaced).toBe(0);
  });
  it("never stitches blocks from different sources: each marker points to one contiguous original", () => {
    const A = "Alpha section explains the cache key, isolation by tenant and project, and the TTL rules. ".repeat(2);
    const C = "Gamma section explains the shadow sampling, regression window and automatic rollback rules. ".repeat(2);
    const s = slots([
      { kind: "user", text: `${A}\n${A.toUpperCase()}` },
      { kind: "user", text: `${C}\n${C.toUpperCase()}` },
      { kind: "user", text: `${A}\n${A.toUpperCase()}\n${C}\n${C.toUpperCase()}` },
    ]);
    const r = dedupeContext(s);
    expect(r.blocksReplaced).toBe(2);
    const lines = s[2]!.text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(MARK("ao da mensagem #1 acima"));
    expect(lines[1]).toMatch(MARK("ao da mensagem #2 acima"));
  });
  it("dedupes a block repeated inside one tool output (reference to the same message)", () => {
    const block = Array.from({ length: 6 }, (_, i) => `  at handler${i} (/app/src/module${i}.ts:${10 + i}:5) — retrying request to upstream service`).join("\n");
    const s = slots([{ kind: "tool_result", text: `attempt 1\n${block}\nattempt 2\n${block}\ndone` }]);
    expect(dedupeContext(s).blocksReplaced).toBe(1);
    const lines = s[0]!.text.split("\n");
    expect(lines.slice(0, 8)).toEqual(["attempt 1", ...block.split("\n"), "attempt 2"]);
    expect(lines[8]).toMatch(MARK("ao trecho anterior desta mensagem"));
    expect(lines[9]).toBe("done");
  });
  it("never touches fenced code in user messages, JSON tool results, or anything not repeated", () => {
    const code = ["```ts", ...Array.from({ length: 12 }, (_, i) => `export function step${i}(input: number): number { return input * ${i} + ${i * 3}; }`), "```"].join("\n");
    const json = JSON.stringify({ rows: Array.from({ length: 30 }, (_, i) => ({ id: i, name: `item number ${i}`, status: "active" })) });
    const s = slots([
      { kind: "user", text: `Meu código:\n\n${code}` },
      { kind: "tool_result", text: json },
      { kind: "user", text: `De novo o mesmo código:\n\n${code}\n\nOnde está o bug?` },
      { kind: "tool_result", text: json },
    ]);
    const before = s.map((x) => x.text);
    const r = dedupeContext(s);
    expect(r.blocksReplaced).toBe(0);
    expect(s.map((x) => x.text)).toEqual(before);
    // the same code inside a (non-JSON) tool output is ordinary text and can be referenced
    const t = slots([{ kind: "user", text: `Meu código:\n\n${code}` }, { kind: "tool_result", text: `$ cat step.ts\n${code}` }]);
    expect(dedupeContext(t).blocksReplaced).toBe(1);
    expect(t[1]!.text.split("\n")[1]).toBe("```ts");
    expect(t[1]!.text.split("\n").at(-1)).toBe("```");
  });
  it("is prefix-stable: earlier messages are rewritten identically on every later turn", () => {
    const doc = "Cláusula única: o reembolso é integral em até 30 dias corridos após a entrega, sem custo. ".repeat(4);
    const turns = [
      { kind: "system" as const, text: "sys" },
      { kind: "user" as const, text: `Leia:\n\n${doc}` },
      { kind: "assistant" as const, text: "ok" },
      { kind: "user" as const, text: `De novo:\n\n${doc}\n\nQual o prazo?` },
      { kind: "assistant" as const, text: "30" },
      { kind: "user" as const, text: `Mais uma vez:\n\n${doc}\n\nE o frete?` },
    ];
    const t4 = slots(turns.slice(0, 4));
    const t6 = slots(turns);
    dedupeContext(t4);
    dedupeContext(t6);
    expect(t6.slice(0, 4).map((x) => x.text)).toEqual(t4.map((x) => x.text));
    expect(t6[5]!.text).toMatch(/^Mais uma vez:\n\n\[maindy: conteúdo idêntico ao da mensagem #2 acima/);
  });
  it("no duplicates → not applied", () => {
    expect(dedupeContext(slots([{ kind: "user", text: big }])).application.applied).toBe(false);
  });
});

describe("loop_guard", () => {
  it("warns/blocks per mode inside the window", () => {
    const g = new LoopGuard(60_000);
    const verdicts = Array.from({ length: 8 }, (_, i) => g.check("k", "balanced", 1000 + i).action);
    expect(verdicts).toEqual(["allow", "allow", "allow", "allow", "warn", "warn", "warn", "block"]);
    expect(g.check("k", "balanced", 1010).message).toContain("loop guard");
  });
  it("conservative only warns; observe never acts", () => {
    const g = new LoopGuard();
    for (let i = 0; i < 20; i++) g.check("c", "conservative", i);
    expect(g.check("c", "conservative", 21).action).toBe("warn");
    const g2 = new LoopGuard();
    for (let i = 0; i < 20; i++) expect(g2.check("o", "observe", i).action).toBe("allow");
  });
  it("window expiry resets the count", () => {
    const g = new LoopGuard(1000);
    for (let i = 0; i < 6; i++) g.check("k", "maximum", i);
    expect(g.check("k", "maximum", 5000).action).toBe("allow");
  });
  it("inactive technique only counts", () => {
    const g = new LoopGuard();
    for (let i = 0; i < 10; i++) expect(g.check("k", "maximum", i, false).action).toBe("allow");
  });
});

describe("retry_budget", () => {
  it("allows first attempts, blocks after repeated failures of the same request", () => {
    const rb = new RetryBudget({ maxRetriesPerRequest: 3 });
    expect(rb.check("k", 0).action).toBe("allow");
    rb.recordOutcome("k", 1, true);
    expect(rb.check("k", 2).action).toBe("allow");
    rb.recordOutcome("k", 3, true);
    rb.recordOutcome("k", 4, true);
    const v = rb.check("k", 5);
    expect(v.action).toBe("block");
    expect(v.message).toContain("retry budget");
    rb.recordOutcome("k", 6, false);
    expect(rb.check("k", 7).action).toBe("allow");
  });
  it("global retry-storm breaker", () => {
    const rb = new RetryBudget({ maxRetriesGlobal: 2 });
    for (const k of ["a", "b", "c"]) rb.recordOutcome(k, 0, true);
    expect(rb.check("a", 1).action).toBe("allow");
    expect(rb.check("b", 2).action).toBe("allow");
    expect(rb.check("c", 3).action).toBe("block");
  });
  it("classifies retryable failures", () => {
    expect(RetryBudget.isRetryableFailure(429)).toBe(true);
    expect(RetryBudget.isRetryableFailure(503)).toBe(true);
    expect(RetryBudget.isRetryableFailure(null)).toBe(true);
    expect(RetryBudget.isRetryableFailure(400)).toBe(false);
  });
});

describe("body techniques", () => {
  it("output_budget only when the client set no cap", () => {
    const b: Record<string, unknown> = { model: "gpt-6.2-sol" };
    expect(applyOutputBudget("openai_chat", b, 1000).applied).toBe(true);
    expect(b.max_completion_tokens).toBe(1000);
    const c = { max_tokens: 50 };
    expect(applyOutputBudget("openai_chat", c, 1000).applied).toBe(false);
    expect(c).toEqual({ max_tokens: 50 });
    const r: Record<string, unknown> = {};
    applyOutputBudget("openai_responses", r, 10);
    expect(r.max_output_tokens).toBe(10);
    expect(applyOutputBudget("anthropic_messages", {}, 10).applied).toBe(false);
  });

  it("model_routing never applies without an explicit mapping", () => {
    const b = { model: "gpt-6.2-astra" };
    expect(applyModelRouting(b, [], 10).routedFrom).toBeNull();
    expect(b.model).toBe("gpt-6.2-astra");
    const r = applyModelRouting(b, [{ from: "gpt-6.2-astra", to: "gpt-6.1-terra" }], 10);
    expect(r).toMatchObject({ routedFrom: "gpt-6.2-astra", application: { applied: true, detail: "gpt-6.2-astra -> gpt-6.1-terra" } });
    expect(b.model).toBe("gpt-6.1-terra");
    const t = { model: "a", tools: [{}] };
    expect(applyModelRouting(t, [{ from: "a", to: "b", noTools: true }], 1).routedFrom).toBeNull();
    expect(applyModelRouting({ model: "a" }, [{ from: "a", to: "b", maxPromptTokens: 10 }], 1000).routedFrom).toBeNull();
  });

  it("prompt_cache_hints adds cache_control to a large system prompt", () => {
    const sys = "You are a careful assistant. ".repeat(200);
    const b: Record<string, unknown> = { model: "claude-sonnet-5-5", system: sys, messages: [] };
    const r = applyPromptCacheHints("anthropic_messages", b);
    expect(r.added).toBe(true);
    expect(b.system).toEqual([{ type: "text", text: sys, cache_control: { type: "ephemeral" } }]);
    const blocks: Record<string, unknown> = { model: "claude-sonnet-5-5", system: [{ type: "text", text: "a" }, { type: "text", text: sys }], messages: [] };
    expect(applyPromptCacheHints("anthropic_messages", blocks).added).toBe(true);
    expect((blocks.system as { cache_control?: unknown }[])[1]!.cache_control).toEqual({ type: "ephemeral" });
  });

  it("prompt_cache_hints respects client cache_control, small prompts and other providers", () => {
    const sys = "x".repeat(10_000);
    const own = { model: "claude-sonnet-5-5", system: sys, messages: [{ role: "user", content: [{ type: "text", text: "q", cache_control: { type: "ephemeral" } }] }] };
    expect(applyPromptCacheHints("anthropic_messages", own)).toMatchObject({ added: false, application: { detail: "client already uses cache_control" } });
    expect(own.system).toBe(sys);
    expect(applyPromptCacheHints("anthropic_messages", { model: "claude-haiku-5-5", system: "x".repeat(5000) }).added).toBe(false); // < 2048 tok est.
    expect(applyPromptCacheHints("openai_chat", { system: sys }).added).toBe(false);
  });
});
