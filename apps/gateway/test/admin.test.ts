/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { testUpstream } from "../src/admin.js";
import { mockServer, startGateway, tempHome, writePolicy, type MockServer } from "./helpers.js";

const MEMORY_KEY = "sk-test-MEMORY-ONLY-key-9876543210";
const PKG = resolve(import.meta.dirname, "..");
const CLI = `node "${join(PKG, "dist", "maindy-gateway.mjs")}"`;

let models: MockServer;
let anthropic: MockServer;
let slow: MockServer;
const gws: { close(): Promise<void> }[] = [];

beforeAll(async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  models = await mockServer((req, res) => {
    if (req.url.startsWith("/v1/models")) {
      if (req.headers.authorization !== `Bearer ${MEMORY_KEY}`) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "bad key" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: Array.from({ length: 60 }, (_, i) => ({ id: `model-${i}`, object: "model" })) }));
      return;
    }
    // chat completions: echo which credential arrived (never the value itself in assertions output)
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "c1", object: "chat.completion", model: "gpt-6.2-sol", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } }));
  });
  anthropic = await mockServer((req, res) => {
    const ok = req.headers["x-api-key"] === MEMORY_KEY && req.headers["anthropic-version"] === "2023-06-01";
    res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { data: [{ id: "claude-sonnet-5-5", type: "model" }], has_more: false } : { error: { type: "authentication_error" } }));
  });
  slow = await mockServer(async (_req, res) => {
    await new Promise((r) => setTimeout(r, 1500));
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
});
afterAll(async () => {
  await Promise.all([models.close(), anthropic.close(), slow.close()]);
});
afterEach(async () => {
  while (gws.length) await gws.pop()!.close();
});

async function boot(opts: { userHome?: string; searchPath?: string } = {}) {
  const home = tempHome();
  writePolicy(home, { mode: "balanced" });
  const gw = await startGateway(home, { openai: models.url, anthropic: anthropic.url, ollama: models.url }, undefined, {
    userHome: opts.userHome ?? tempHome("maindy-user-"),
    searchPath: opts.searchPath ?? "",
    cliCommand: CLI,
  });
  gws.push(gw);
  const call = async (method: string, path: string, body?: unknown, key: string | null = gw.ctx.key) => {
    const res = await fetch(gw.url + path, {
      method,
      headers: { ...(key ? { "x-maindy-key": key } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, json, text };
  };
  return { gw, home, call };
}

describe("admin auth", () => {
  it("every new /maindy/* admin route requires x-maindy-key", async () => {
    const { call } = await boot();
    const routes: [string, string][] = [
      ["GET", "/maindy/upstreams"],
      ["PUT", "/maindy/upstreams/openai"],
      ["POST", "/maindy/upstreams/openai/test"],
      ["GET", "/maindy/integrations"],
      ["POST", "/maindy/integrations/claude-code/install"],
      ["POST", "/maindy/integrations/claude-code/uninstall"],
      ["POST", "/maindy/integrations/codex/install"],
      ["POST", "/maindy/integrations/codex/uninstall"],
    ];
    for (const [m, p] of routes) {
      expect((await call(m, p, m === "GET" ? undefined : {}, null)).status, `${m} ${p}`).toBe(401);
      expect((await call(m, p, m === "GET" ? undefined : {}, "wrong-key")).status, `${m} ${p}`).toBe(401);
    }
  });
});

describe("upstreams", () => {
  it("lists upstreams with credential provenance", async () => {
    const { call } = await boot();
    const r = await call("GET", "/maindy/upstreams");
    expect(r.status).toBe(200);
    expect(r.json.upstreams.map((u: any) => u.id)).toEqual(["openai", "anthropic", "ollama"]);
    expect(r.json.upstreams[0]).toEqual({ id: "openai", kind: "openai_api", baseUrl: models.url, hasCredential: false, credentialSource: "none" });
    expect(r.json.upstreams[2]).toMatchObject({ id: "ollama", kind: "openai_compatible", credentialSource: "none" });
    process.env.ANTHROPIC_API_KEY = "sk-ant-env-key";
    try {
      expect((await call("GET", "/maindy/upstreams")).json.upstreams[1]).toMatchObject({ hasCredential: true, credentialSource: "env" });
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("apiKey lives only in memory: used upstream, never on disk, logs or telemetry; null clears it", async () => {
    const { gw, home, call } = await boot();
    const put = await call("PUT", "/maindy/upstreams/openai", { apiKey: MEMORY_KEY });
    expect(put.status).toBe(200);
    expect(put.json).toEqual({ id: "openai", kind: "openai_api", baseUrl: models.url, hasCredential: true, credentialSource: "memory" });
    expect((await call("GET", "/maindy/status")).json.upstreams[0].hasCredential).toBe(true);

    // the proxy injects it when the client sent no credential
    const before = models.calls.length;
    const chat = await fetch(`${gw.url}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-6.2-sol", messages: [{ role: "user", content: "oi" }] }) });
    expect(chat.status).toBe(200);
    expect(models.calls.slice(before).find((c) => c.url === "/v1/chat/completions")?.headers.authorization).toBe(`Bearer ${MEMORY_KEY}`);
    await gw.ctx.flusher.flushAll().catch(() => undefined);

    // nothing under MAINDY_HOME contains the key (gateway.json, log, sqlite db + wal, policy…)
    for (const f of readdirSync(home)) {
      const buf = readFileSync(join(home, f));
      expect(buf.includes(Buffer.from(MEMORY_KEY)), f).toBe(false);
      expect(buf.includes(Buffer.from("MEMORY-ONLY")), f).toBe(false);
    }
    expect(JSON.stringify(gw.ctx.credentials)).toBe("{}");

    const cleared = await call("PUT", "/maindy/upstreams/openai", { apiKey: null });
    expect(cleared.json).toMatchObject({ hasCredential: false, credentialSource: "none" });
  });

  it("validates and persists baseUrl (http only on loopback)", async () => {
    const { home, call } = await boot();
    const bad = async (baseUrl: string) => {
      const r = await call("PUT", "/maindy/upstreams/openai", { baseUrl });
      expect(r.status, baseUrl).toBe(400);
      expect(r.json.error.code).toBe("invalid_base_url");
    };
    await bad("http://api.example.com");
    await bad("ftp://127.0.0.1/x");
    await bad("not a url");
    await bad("https://user:pass@api.example.com");
    await bad("https://api.example.com/v1?key=abc");
    expect((await call("PUT", "/maindy/upstreams/nope", { baseUrl: "https://x.example" })).status).toBe(404);
    expect((await call("PUT", "/maindy/upstreams/openai", { apiKey: "has space" })).status).toBe(400);

    const ok = await call("PUT", "/maindy/upstreams/openai", { baseUrl: "https://openrouter.example/api/v1/" });
    expect(ok.status).toBe(200);
    expect(ok.json.baseUrl).toBe("https://openrouter.example/api/v1");
    const file = JSON.parse(readFileSync(join(home, "gateway.json"), "utf8"));
    expect(file.upstreams.find((u: any) => u.id === "openai").baseUrl).toBe("https://openrouter.example/api/v1");
    expect((await call("PUT", "/maindy/upstreams/ollama", { baseUrl: "http://localhost:11434" })).json.baseUrl).toBe("http://localhost:11434");
  });

  it("repointing an upstream never replays answers cached from the previous backend", async () => {
    const { gw, call } = await boot();
    await call("PUT", "/maindy/upstreams/openai", { apiKey: MEMORY_KEY });
    const ask = () =>
      fetch(`${gw.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-6.2-sol", temperature: 0, messages: [{ role: "user", content: "Classifique: fatura duplicada" }] }),
      });
    expect((await ask()).headers.get("x-maindy-cache")).toBe("miss");
    expect((await ask()).headers.get("x-maindy-cache")).toBe("hit");
    // same server, different (equivalent) address → a new cache scope
    await call("PUT", "/maindy/upstreams/openai", { baseUrl: models.url.replace("127.0.0.1", "localhost") });
    expect((await ask()).headers.get("x-maindy-cache")).toBe("miss");
  });

  it("tests a provider via GET /v1/models (≤ 50 models, pt-BR errors)", async () => {
    const { gw, call } = await boot();
    // OpenAI without any credential → no network call, explicit error
    const none = await call("POST", "/maindy/upstreams/openai/test");
    expect(none.json).toMatchObject({ ok: false, models: [], error: { code: "missing_credential" } });

    await call("PUT", "/maindy/upstreams/openai", { apiKey: MEMORY_KEY });
    const ok = await call("POST", "/maindy/upstreams/openai/test");
    expect(ok.status).toBe(200);
    expect(ok.json.ok).toBe(true);
    expect(ok.json.error).toBeNull();
    expect(ok.json.models).toHaveLength(50);
    expect(ok.json.models[0]).toBe("model-0");
    expect(typeof ok.json.latencyMs).toBe("number");

    await call("PUT", "/maindy/upstreams/openai", { apiKey: "sk-wrong-key" });
    expect((await call("POST", "/maindy/upstreams/openai/test")).json).toMatchObject({ ok: false, error: { code: "unauthorized" } });

    await call("PUT", "/maindy/upstreams/anthropic", { apiKey: MEMORY_KEY });
    expect((await call("POST", "/maindy/upstreams/anthropic/test")).json).toMatchObject({ ok: true, models: ["claude-sonnet-5-5"] });

    // ollama (no key needed) → mock rejects (no bearer) → unauthorized is reported, not thrown
    expect((await call("POST", "/maindy/upstreams/ollama/test")).json.error.code).toBe("unauthorized");

    await call("PUT", "/maindy/upstreams/ollama", { baseUrl: "http://127.0.0.1:9" });
    const down = await call("POST", "/maindy/upstreams/ollama/test");
    expect(down.json).toMatchObject({ ok: false, error: { code: "unreachable" } });
    expect(down.json.error.message).toMatch(/conectar/);

    const u = { ...gw.ctx.cfg.upstreams[2]!, baseUrl: slow.url };
    expect((await testUpstream(gw.ctx, u, 200)).error?.code).toBe("timeout");
    expect((await call("POST", "/maindy/upstreams/nope/test")).status).toBe(404);
  });
});

describe("integrations", () => {
  it("detects, installs (dry-run first), reports and uninstalls Claude Code with backups", async () => {
    const userHome = tempHome("maindy-user-");
    const { gw, home, call } = await boot({ userHome });
    let st = (await call("GET", "/maindy/integrations")).json;
    expect(st.claudeCode).toEqual({ detected: false, installed: false, settingsPath: join(userHome, ".claude", "settings.json"), otel: false, statusLine: false, hook: false, lastEventAt: null });
    expect(st.codex).toMatchObject({ detected: false, installed: false, otel: false, lastEventAt: null, configPath: join(userHome, ".codex", "config.toml") });

    const settings = join(userHome, ".claude", "settings.json");
    mkdirSync(join(userHome, ".claude"), { recursive: true });
    const original = { model: "opus", permissions: { allow: ["Bash(ls:*)"] }, env: { FOO: "bar" } };
    writeFileSync(settings, JSON.stringify(original, null, 2));
    expect((await call("GET", "/maindy/integrations")).json.claudeCode.detected).toBe(true);

    const dry = await call("POST", "/maindy/integrations/claude-code/install", { dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.json.ok).toBe(true);
    expect(dry.json.backupPath).toBeNull();
    expect(dry.json.changed.length).toBeGreaterThan(0);
    const preview = JSON.parse(dry.json.preview);
    expect(preview.statusLine.command).toBe(`${CLI} statusline --home "${resolve(home)}"`);
    expect(preview.hooks.PostToolUse[0].hooks[0].command).toBe(`${CLI} hook posttooluse --home "${resolve(home)}"`);
    expect(preview.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(gw.url);
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual(original); // dry run wrote nothing

    const inst = await call("POST", "/maindy/integrations/claude-code/install", {});
    expect(inst.json.ok).toBe(true);
    expect(inst.json.preview).toBeUndefined();
    expect(inst.json.backupPath).toMatch(/settings\.json\.maindy-backup-/);
    expect(JSON.parse(readFileSync(inst.json.backupPath, "utf8"))).toEqual(original);
    const written = JSON.parse(readFileSync(settings, "utf8"));
    expect(written).toMatchObject({ model: "opus", permissions: { allow: ["Bash(ls:*)"] }, env: { FOO: "bar", CLAUDE_CODE_ENABLE_TELEMETRY: "1" } });
    st = (await call("GET", "/maindy/integrations")).json;
    expect(st.claudeCode).toMatchObject({ detected: true, installed: true, otel: true, statusLine: true, hook: true });

    // idempotent
    expect((await call("POST", "/maindy/integrations/claude-code/install", {})).json).toMatchObject({ ok: true, changed: [], backupPath: null });

    // OTLP from Claude Code marks lastEventAt
    await fetch(`${gw.url}/v1/metrics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceMetrics: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "claude-code" } }] }, scopeMetrics: [{ metrics: [{ name: "claude_code.session.count" }] }] }] }),
    });
    st = (await call("GET", "/maindy/integrations")).json;
    expect(Date.parse(st.claudeCode.lastEventAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(st.codex.lastEventAt).toBeNull();

    const un = await call("POST", "/maindy/integrations/claude-code/uninstall", {});
    expect(un.json.ok).toBe(true);
    expect(un.json.backupPath).toMatch(/maindy-backup-/);
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual(original);
    expect((await call("GET", "/maindy/integrations")).json.claudeCode).toMatchObject({ installed: false, otel: false, statusLine: false, hook: false });
  });

  it("refuses to touch an invalid settings.json (422) and detects binaries on PATH", async () => {
    const userHome = tempHome("maindy-user-");
    const bin = tempHome("maindy-bin-");
    writeFileSync(join(bin, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const { call } = await boot({ userHome, searchPath: bin });
    expect((await call("GET", "/maindy/integrations")).json.codex.detected).toBe(true);
    mkdirSync(join(userHome, ".claude"));
    writeFileSync(join(userHome, ".claude", "settings.json"), "{ not json");
    const r = await call("POST", "/maindy/integrations/claude-code/install", {});
    expect(r.status).toBe(422);
    expect(r.json).toMatchObject({ ok: false, changed: [], backupPath: null, error: { code: "invalid_config" } });
    expect(readFileSync(join(userHome, ".claude", "settings.json"), "utf8")).toBe("{ not json");
  });

  it("installs/uninstalls the Codex OTel block, refuses an unmanaged [otel] (409)", async () => {
    const userHome = tempHome("maindy-user-");
    const { gw, call } = await boot({ userHome });
    const cfgPath = join(userHome, ".codex", "config.toml");
    mkdirSync(join(userHome, ".codex"));
    const original = 'model = "gpt-6.2-sol"\n\n[profiles.fast]\nmodel = "gpt-6-luna"\n';
    writeFileSync(cfgPath, original);

    const dry = await call("POST", "/maindy/integrations/codex/install", { dryRun: true });
    expect(dry.json.ok).toBe(true);
    expect(dry.json.preview).toContain(`endpoint = "${gw.url}/v1/logs"`);
    expect(readFileSync(cfgPath, "utf8")).toBe(original);

    const inst = await call("POST", "/maindy/integrations/codex/install", {});
    expect(inst.json.changed).toHaveLength(1);
    expect(readFileSync(inst.json.backupPath, "utf8")).toBe(original);
    expect(readFileSync(cfgPath, "utf8")).toContain("[profiles.fast]");
    expect((await call("GET", "/maindy/integrations")).json.codex).toMatchObject({ detected: true, installed: true, otel: true });

    await fetch(`${gw.url}/v1/logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceLogs: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "codex_cli_rs" } }] }, scopeLogs: [{ logRecords: [{ attributes: [{ key: "event.name", value: { stringValue: "codex.conversation_starts" } }] }] }] }] }),
    });
    expect((await call("GET", "/maindy/integrations")).json.codex.lastEventAt).not.toBeNull();

    const un = await call("POST", "/maindy/integrations/codex/uninstall", {});
    expect(un.json.ok).toBe(true);
    expect(readFileSync(cfgPath, "utf8")).toBe(original);

    writeFileSync(cfgPath, `${original}\n[otel]\nlog_user_prompt = false\n`);
    const conflict = await call("POST", "/maindy/integrations/codex/install", {});
    expect(conflict.status).toBe(409);
    expect(conflict.json).toMatchObject({ ok: false, error: { code: "config_conflict" } });
    expect(conflict.json.error.message).toMatch(/não sobrescreve/);
  });
});

describe("CLI subcommands (no Node-specific scripts needed)", () => {
  const runCli = (args: string[], stdin: string, env: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string; ms: number }>((res) => {
      const t0 = Date.now();
      const p = spawn(process.execPath, ["--import", "tsx", join(PKG, "src", "main.ts"), ...args], { cwd: PKG, env: { ...process.env, ...env } });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.on("close", (code) => res({ code, out, ms: Date.now() - t0 }));
      p.stdin.end(stdin);
    });

  it("statusline reports to this gateway and prints one line; hook compresses a verbose Bash output", async () => {
    const { gw, home } = await boot();
    expect(existsSync(join(home, "runtime.json"))).toBe(true);
    const sl = await runCli(["statusline", "--home", home], JSON.stringify({ model: { display_name: "Sonnet" }, rate_limits: { five_hour: { used_percentage: 37, resets_at: 1795000000 } } }));
    expect(sl.code).toBe(0);
    expect(sl.out.trim().split("\n")).toHaveLength(1);
    expect(sl.out).toMatch(/^maindy\. Sonnet/);
    expect(sl.out).toContain("5h 37%");
    // quota captured by THIS gateway (not the live app's)
    expect(gw.ctx.db.quotas().some((q) => q.window === "five_hour" && q.usedPercentage === 37)).toBe(true);

    const stdout = Array.from({ length: 400 }, () => "[db] waiting for connection...").join("\n") + "\nError: connect ECONNREFUSED 127.0.0.1:5432";
    const hook = await runCli(["hook", "posttooluse", "--home", home], JSON.stringify({ tool_name: "Bash", tool_response: { stdout, stderr: "", interrupted: false, isImage: false } }));
    expect(hook.code).toBe(0);
    const out = JSON.parse(hook.out);
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.updatedToolOutput.stdout.length).toBeLessThan(stdout.length / 5);
    expect(out.hookSpecificOutput.updatedToolOutput.stdout).toContain("ECONNREFUSED");

    // small outputs and a dead gateway: prints nothing, exits 0
    // (MAINDY_GATEWAY_URL → a closed port, so this never reaches the real app's gateway on 8787)
    const quiet = await runCli(["hook", "posttooluse", "--home", tempHome()], JSON.stringify({ tool_name: "Bash", tool_response: { stdout } }), { MAINDY_GATEWAY_URL: "http://127.0.0.1:9" });
    expect(quiet).toMatchObject({ code: 0, out: "" });
  });
});
