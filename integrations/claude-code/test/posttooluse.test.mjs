import { describe, it, expect, afterEach } from "vitest";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decideHookOutput } from "../src/posttooluse.mjs";
import { mockGateway, tempDir } from "./helpers.mjs";

const BIN = fileURLToPath(new URL("../bin/maindy-posttooluse.mjs", import.meta.url));
const bigStdout = Array.from({ length: 400 }, (_, i) => `line ${i % 3} PASS test`).join("\n");
const input = (stdout = bigStdout, tool = "Bash") => ({
  session_id: "s",
  hook_event_name: "PostToolUse",
  tool_name: tool,
  tool_input: { command: "npm test" },
  tool_response: { stdout, stderr: "warn", interrupted: false, isImage: false },
});

let gw;
afterEach(async () => {
  await gw?.close();
  gw = undefined;
});

const compressResp = (o = {}) => ({ json: { applied: true, text: "short [maindy: 380 linhas omitidas]", originalTokens: 2000, compressedTokens: 300, tokensSaved: 1700, source: "locally_measured", elapsedMs: 3, ...o } });

describe("PostToolUse hook", () => {
  it("returns updatedToolOutput when compression is meaningful", async () => {
    gw = await mockGateway(() => compressResp());
    const env = { MAINDY_HOME: tempDir(), MAINDY_GATEWAY_URL: gw.url, MAINDY_GATEWAY_KEY: "kk" };
    const out = await decideHookOutput(input(), { env });
    expect(out).toEqual({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        updatedToolOutput: { stdout: "short [maindy: 380 linhas omitidas]", stderr: "warn", interrupted: false, isImage: false },
      },
    });
    expect(gw.calls[0].url).toBe("/maindy/compress");
    expect(gw.calls[0].headers["x-maindy-key"]).toBe("kk");
    expect(JSON.parse(gw.calls[0].body)).toEqual({ text: bigStdout, toolName: "Bash" });
  });

  it("returns null when savings are not meaningful", async () => {
    for (const r of [
      compressResp({ applied: false }),
      compressResp({ tokensSaved: 150 }),
      compressResp({ originalTokens: 20000, tokensSaved: 1000 }), // 5%
      { status: 500, json: { error: "x" } },
      { json: "garbage" },
    ]) {
      gw = await mockGateway(() => r);
      expect(await decideHookOutput(input(), { env: { MAINDY_GATEWAY_URL: gw.url, MAINDY_HOME: tempDir() } })).toBeNull();
      await gw.close();
      gw = undefined;
    }
  });

  it("skips small outputs and non-Bash tools without calling the gateway", async () => {
    gw = await mockGateway(() => compressResp());
    const env = { MAINDY_GATEWAY_URL: gw.url, MAINDY_HOME: tempDir() };
    expect(await decideHookOutput(input("tiny"), { env })).toBeNull();
    expect(await decideHookOutput(input(bigStdout, "Read"), { env })).toBeNull();
    expect(await decideHookOutput(null, { env })).toBeNull();
    expect(gw.calls).toHaveLength(0);
  });

  it("returns null on timeout", async () => {
    gw = await mockGateway(() => ({ ...compressResp(), delayMs: 1000 }));
    const t0 = Date.now();
    expect(await decideHookOutput(input(), { env: { MAINDY_GATEWAY_URL: gw.url, MAINDY_HOME: tempDir() }, timeoutMs: 100 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("bin prints JSON when meaningful, nothing on failure", async () => {
    gw = await mockGateway(() => compressResp());
    const run = (env) =>
      new Promise((resolve) => {
        const c = spawn(process.execPath, [BIN], { env: { ...process.env, MAINDY_HOME: tempDir(), ...env } });
        let out = "";
        c.stdout.on("data", (d) => (out += d));
        c.on("close", (code) => resolve({ code, out }));
        c.stdin.end(JSON.stringify(input()));
      });
    const ok = await run({ MAINDY_GATEWAY_URL: gw.url });
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out).hookSpecificOutput.updatedToolOutput.stdout).toContain("maindy:");
    const down = await run({ MAINDY_GATEWAY_URL: "http://127.0.0.1:1" });
    expect(down).toEqual({ code: 0, out: "" });
    const garbage = spawnSync(process.execPath, [BIN], { input: "{oops", encoding: "utf8" });
    expect(garbage.status).toBe(0);
    expect(garbage.stdout).toBe("");
  });
});
