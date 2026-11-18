import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { mapRateLimits, readCodexRateLimits } from "../src/app-server-rate-limits.mjs";

const FAKE = fileURLToPath(new URL("./fake-app-server.mjs", import.meta.url));
const fake = (mode, extra = {}) => ({ command: process.execPath, args: [FAKE, mode], experimental: true, ...extra });

describe("codex app-server rate limits (experimental)", () => {
  it("maps rateLimits to quota snapshots", () => {
    const at = new Date("2026-11-18T00:00:00Z");
    expect(mapRateLimits({ primary: { usedPercent: 120, windowDurationMins: 300, resetsAt: 1790000000 } }, at)).toEqual([
      {
        provider: "openai",
        product: "codex",
        window: "300m",
        usedPercentage: 100,
        resetsAt: new Date(1790000000 * 1000).toISOString(),
        collectedVia: "codex.app_server",
        capturedAt: at.toISOString(),
      },
    ]);
    expect(mapRateLimits(null)).toEqual([]);
    expect(mapRateLimits({ primary: { usedPercent: "x" } })).toEqual([]);
  });

  it("is disabled unless the experimental flag is set", async () => {
    expect(await readCodexRateLimits({ command: process.execPath, args: [FAKE, "ok"], env: {} })).toEqual([]);
  });

  it("reads limits from a (fake) app-server over JSONL", async () => {
    const snaps = await readCodexRateLimits(fake("ok"));
    expect(snaps.map((s) => [s.window, s.usedPercentage])).toEqual([["300m", 42.5], ["10080m", 7]]);
    expect(snaps[1].resetsAt).toBeNull();
  });

  it("returns [] on error, timeout or missing binary", async () => {
    expect(await readCodexRateLimits(fake("init-error"))).toEqual([]);
    const t0 = Date.now();
    expect(await readCodexRateLimits(fake("hang", { timeoutMs: 300 }))).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(await readCodexRateLimits({ command: "/nonexistent/codex-maindy-test", experimental: true })).toEqual([]);
  });
});
