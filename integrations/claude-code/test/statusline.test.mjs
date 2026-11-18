import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatStatusLine, fmtCompact, runStatusLine } from "../src/statusline.mjs";
import { mockGateway, stdinOf, tempDir } from "./helpers.mjs";

const BIN = fileURLToPath(new URL("../bin/maindy-statusline.mjs", import.meta.url));

const sample = {
  session_id: "s1",
  model: { id: "claude-sonnet-5-5", display_name: "Sonnet 5.5" },
  workspace: { current_dir: "/x", project_dir: "/x" },
  cost: { total_cost_usd: 0.4234, total_duration_ms: 1000 },
  context_window: { total_input_tokens: 1, total_output_tokens: 1, context_window_size: 200000, used_percentage: 37.2 },
  rate_limits: { five_hour: { used_percentage: 22, resets_at: 1790000000 }, seven_day: { used_percentage: 41.4, resets_at: 1790500000 } },
};

let gw;
afterEach(async () => {
  await gw?.close();
  gw = undefined;
});

describe("statusline formatting", () => {
  it("formats every piece in pt-BR", () => {
    const line = formatStatusLine(sample, { counters: { requests: 40, cacheHits: 12, tokensAvoided: 18400, savedMicros: 120000, savedSource: "experimentally_estimated" } });
    expect(line).toBe("maindy. Sonnet 5.5 · US$ 0,42 sessão · ctx 37% · 5h 22% · 7d 41% · cache 12 hits · 18,4k tok evitados · ~US$ 0,12 econ. estimada");
  });

  it("omits absent pieces and never shows savings with unavailable source", () => {
    expect(formatStatusLine({ model: { id: "claude-x" } }, null)).toBe("maindy. claude-x");
    expect(formatStatusLine(null, null)).toBe("maindy.");
    const l = formatStatusLine({}, { counters: { cacheHits: 0, tokensAvoided: 0, savedMicros: 5, savedSource: "unavailable" } });
    expect(l).not.toMatch(/econ/);
    expect(formatStatusLine({}, null, { offline: true })).toBe("maindy. gateway offline");
  });

  it("falls back to gateway quotas when stdin has no rate_limits", () => {
    const l = formatStatusLine({}, { quotas: [{ window: "five_hour", usedPercentage: 10 }] });
    expect(l).toContain("5h 10%");
  });

  it("compact numbers", () => {
    expect(fmtCompact(999)).toBe("999");
    expect(fmtCompact(18400)).toBe("18,4k");
    expect(fmtCompact(2_500_000)).toBe("2,5M");
  });
});

describe("statusline runtime", () => {
  it("posts stdin to the gateway with the key and caches counters", async () => {
    const home = tempDir();
    writeFileSync(join(home, "gateway.key"), "k-123\n", { mode: 0o600 });
    gw = await mockGateway(() => ({ json: { ok: true, counters: { cacheHits: 3, tokensAvoided: 1200, savedMicros: 0, savedSource: "unavailable" }, quotas: [] } }));
    const env = { MAINDY_HOME: home, MAINDY_GATEWAY_URL: gw.url };
    // functional check (not a timing check): generous budget so a loaded CI machine can't flake it
    const line = await runStatusLine({ env, stdin: stdinOf(JSON.stringify(sample)), budgetMs: 3000 });
    expect(line).toContain("cache 3 hits");
    expect(line).toContain("1,2k tok evitados");
    expect(gw.calls[0].url).toBe("/maindy/statusline");
    expect(gw.calls[0].headers["x-maindy-key"]).toBe("k-123");
    expect(JSON.parse(gw.calls[0].body)).toEqual(sample);
    expect(existsSync(join(home, "statusline-cache.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(home, "statusline-cache.json"), "utf8")).counters.cacheHits).toBe(3);
  });

  it("times out fast against a slow gateway and uses cached counters", async () => {
    const home = tempDir();
    writeFileSync(join(home, "statusline-cache.json"), JSON.stringify({ counters: { cacheHits: 7 } }));
    gw = await mockGateway(() => ({ delayMs: 10000, json: { ok: true, counters: { cacheHits: 99 } } }));
    const t0 = Date.now();
    const line = await runStatusLine({ env: { MAINDY_HOME: home, MAINDY_GATEWAY_URL: gw.url }, stdin: stdinOf(JSON.stringify(sample)) });
    // never waits for the 10 s gateway: bounded by the ~190 ms budget (slack for loaded machines)
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(line).toContain("cache 7 hits");
    expect(line).toContain("gateway offline");
  });

  it("bin process never waits for a slow gateway and prints one line", async () => {
    const home = tempDir();
    gw = await mockGateway(() => ({ delayMs: 20000, json: {} }));
    // Baseline: bare node startup on this same machine right now (varies a lot under load).
    const b0 = Date.now();
    spawnSync(process.execPath, ["-e", ""]);
    const nodeStartup = Date.now() - b0;
    const t0 = Date.now();
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [BIN], { env: { ...process.env, MAINDY_HOME: home, MAINDY_GATEWAY_URL: gw.url } });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.on("close", (code) => resolve({ code, out }));
      child.stdin.end(JSON.stringify(sample));
    });
    const elapsed = Date.now() - t0;
    expect(r.code).toBe(0);
    expect(r.out.trim().split("\n")).toHaveLength(1);
    expect(r.out.startsWith("maindy.")).toBe(true);
    // The property under test: the bin never waits for the slow (3 s) gateway. Its own work is
    // bounded by the ~190 ms budget; allow slack for module loading under load.
    expect(elapsed - nodeStartup).toBeLessThan(5000);
    expect(elapsed).toBeLessThan(10000); // a bin that waited for the gateway would take ≥ 20 s
  });

  it("bin prints a line when the gateway is unreachable", () => {
    const home = tempDir();
    const r = spawnSync(process.execPath, [BIN], { input: JSON.stringify(sample), encoding: "utf8", env: { ...process.env, MAINDY_HOME: home, MAINDY_GATEWAY_URL: "http://127.0.0.1:1" } });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^maindy\. Sonnet 5\.5 .*gateway offline\n$/);
  });

  it("bin survives garbage stdin", () => {
    const r = spawnSync(process.execPath, [BIN], { input: "not json", encoding: "utf8", env: { ...process.env, MAINDY_HOME: tempDir(), MAINDY_GATEWAY_URL: "http://127.0.0.1:1" } });
    expect(r.status).toBe(0);
    expect(r.stdout.startsWith("maindy.")).toBe(true);
  });
});

