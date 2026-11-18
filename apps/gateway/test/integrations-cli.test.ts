/* `maindy-gateway integrations …` — every test uses a temporary HOME (never the real ~/.claude, ~/.codex, ~/.maindy). */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runIntegrationsCli } from "../src/integrations-cli.js";
import { redactLine, resolveGatewayPort, unifiedDiff } from "../src/integrations.js";
import { tempHome } from "./helpers.js";

const PKG = resolve(import.meta.dirname, "..");
const CLI = `"/Applications/maindy.app/Contents/MacOS/maindy-gateway"`;
// no MAINDY_HOME / MAINDY_GATEWAY_PORT from the developer's shell; empty PATH → detection only by directories
const ENV = { PATH: "" } as NodeJS.ProcessEnv;
const run = (args: string[]) => runIntegrationsCli(args, { env: ENV, cliCommand: CLI });

function userHomeWithClaude(settings?: unknown) {
  const home = tempHome("maindy-cli-home-");
  mkdirSync(join(home, ".claude"));
  if (settings !== undefined) writeFileSync(join(home, ".claude", "settings.json"), typeof settings === "string" ? settings : JSON.stringify(settings, null, 2));
  return home;
}

describe("integrations CLI — usage", () => {
  it("rejects bad arguments with exit 64 and the pt-BR usage", () => {
    for (const args of [[], ["claude-code"], ["cursor", "install"], ["claude-code", "remove"], ["claude-code", "install", "--yes"], ["claude-code", "status", "--dry-run"], ["codex", "install", "--force-statusline"], ["claude-code", "install", "--home"], ["claude-code", "install", "extra", "arg"]]) {
      const r = run(args);
      expect(r.code, args.join(" ")).toBe(64);
      expect(r.stderr).toContain("Uso: maindy-gateway integrations");
    }
    expect(run(["--help"])).toMatchObject({ code: 0 });
  });
});

describe("integrations CLI — Claude Code", () => {
  it("status → dry-run (diff, nothing written) → install (backup) → status → uninstall restores the original", () => {
    const original = { model: "opus", permissions: { allow: ["Bash(ls:*)"] }, env: { FOO: "bar", ANTHROPIC_API_KEY: "sk-ant-SECRET-123" } };
    const home = userHomeWithClaude(original);
    const settings = join(home, ".claude", "settings.json");

    let r = run(["claude-code", "status", "--home", home]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Claude Code encontrado nesta máquina: sim");
    expect(r.stdout).toContain("integração maindy. instalada: não");
    expect(r.stdout).toContain(`${CLI} integrations claude-code install --dry-run`);

    r = run(["claude-code", "install", "--dry-run", "--home", home]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("simulação: nada foi gravado");
    expect(r.stdout).toContain(`--- ${settings}`);
    expect(r.stdout).toMatch(/^\+ .*"OTEL_EXPORTER_OTLP_ENDPOINT": "http:\/\/127\.0\.0\.1:8787"/m);
    expect(r.stdout).toContain(`${CLI.replace(/"/g, '\\"')} statusline --home \\"${join(home, ".maindy")}\\"`);
    expect(r.stdout).not.toContain("sk-ant-SECRET-123"); // secret-looking values masked in the diff
    expect(r.stdout).toContain("Para aplicar, rode o mesmo comando sem --dry-run.");
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual(original);
    expect(existsSync(join(home, ".maindy"))).toBe(false); // dry run creates nothing

    r = run(["claude-code", "install", "--home", home]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("instalação concluída");
    expect(r.stdout).toContain("Reinicie o Claude Code");
    const backup = r.stdout.match(/backup da versão anterior: (.+)/)?.[1];
    expect(backup).toMatch(/settings\.json\.maindy-backup-/);
    expect(JSON.parse(readFileSync(backup!, "utf8"))).toEqual(original);
    const written = JSON.parse(readFileSync(settings, "utf8"));
    expect(written).toMatchObject({ model: "opus", env: { FOO: "bar", CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:8787" } });
    expect(written.statusLine.command).toBe(`${CLI} statusline --home "${join(home, ".maindy")}"`);
    expect(written.hooks.PostToolUse[0].hooks[0].command).toBe(`${CLI} hook posttooluse --home "${join(home, ".maindy")}"`);

    r = run(["claude-code", "status", "--home", home]);
    expect(r.stdout).toContain("OpenTelemetry → gateway maindy. (porta 8787): sim");
    expect(r.stdout).toContain("status line maindy. (limites da assinatura): sim");
    expect(r.stdout).toContain("hook PostToolUse (compressão de saídas do Bash): sim");
    expect(r.stdout).toContain("integração maindy. instalada: sim");
    const js = JSON.parse(run(["claude-code", "status", "--json", "--home", home]).stdout);
    expect(js).toMatchObject({ ok: true, tool: "claude-code", installed: true, otel: true, statusLine: true, hook: true, gatewayPort: 8787 });

    // idempotent
    const again = JSON.parse(run(["claude-code", "install", "--json", "--home", home]).stdout);
    expect(again).toMatchObject({ ok: true, changed: [], backupPath: null });

    r = run(["claude-code", "uninstall", "--home", home]);
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(settings, "utf8"))).toEqual(original);
    expect(run(["claude-code", "status", "--home", home]).stdout).toContain("integração maindy. instalada: não");
  });

  it("never touches an invalid settings.json (exit 3) and keeps a foreign status line", () => {
    const home = userHomeWithClaude("{ not json");
    const r = run(["claude-code", "install", "--home", home]);
    expect(r.code).toBe(3);
    expect(r.stderr).toMatch(/não é um JSON válido/);
    expect(readFileSync(join(home, ".claude", "settings.json"), "utf8")).toBe("{ not json");
    expect(run(["claude-code", "status", "--home", home]).code).toBe(3);
    expect(JSON.parse(run(["claude-code", "install", "--json", "--home", home]).stdout)).toMatchObject({ ok: false, error: { code: "invalid_config" } });

    const h2 = userHomeWithClaude({ statusLine: { type: "command", command: "my-line" } });
    expect(run(["claude-code", "install", "--home", h2]).code).toBe(0);
    expect(JSON.parse(readFileSync(join(h2, ".claude", "settings.json"), "utf8")).statusLine.command).toBe("my-line");
    expect(run(["claude-code", "status", "--home", h2]).stdout).toContain("há outra statusLine sua, mantida");
  });

  it("points OTel at the port of the gateway that owns --maindy-home (runtime.json with a live pid > gateway.json)", () => {
    const home = userHomeWithClaude({});
    const mh = tempHome("maindy-cli-mh-");
    writeFileSync(join(mh, "gateway.json"), JSON.stringify({ port: 9911 }));
    expect(resolveGatewayPort(mh, {})).toBe(9911);
    writeFileSync(join(mh, "runtime.json"), JSON.stringify({ pid: process.pid, port: 9922 }));
    expect(resolveGatewayPort(mh, {})).toBe(9922);
    writeFileSync(join(mh, "runtime.json"), JSON.stringify({ pid: 2 ** 22 + 12345, port: 9933 })); // dead pid → ignored
    expect(resolveGatewayPort(mh, { MAINDY_GATEWAY_PORT: "9944" })).toBe(9944);
    const r = run(["claude-code", "install", "--dry-run", "--json", "--home", home, "--maindy-home", mh]);
    expect(JSON.parse(r.stdout).diff).toContain('"OTEL_EXPORTER_OTLP_ENDPOINT": "http://127.0.0.1:9911"');
  });
});

describe("integrations CLI — Codex", () => {
  it("dry-run diff, install, status, refuses an unmanaged [otel] (exit 2)", () => {
    const home = tempHome("maindy-cli-home-");
    mkdirSync(join(home, ".codex"));
    const cfg = join(home, ".codex", "config.toml");
    const original = 'model = "gpt-6.2-sol"\n';
    writeFileSync(cfg, original);
    let r = run(["codex", "install", "--dry-run", "--home", home]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('+ exporter = { otlp-http = { endpoint = "http://127.0.0.1:8787/v1/logs", protocol = "json" } }');
    expect(readFileSync(cfg, "utf8")).toBe(original);
    r = run(["codex", "install", "--home", home]);
    expect(r.code).toBe(0);
    expect(readFileSync(cfg, "utf8")).toContain("[otel]");
    expect(run(["codex", "status", "--home", home]).stdout).toContain("integração maindy. instalada: sim");
    expect(run(["codex", "uninstall", "--home", home]).code).toBe(0);
    expect(readFileSync(cfg, "utf8")).toBe(original);

    const mine = `${original}\n[otel]\nlog_user_prompt = true\n`;
    writeFileSync(cfg, mine);
    const files = readdirSync(join(home, ".codex")).length;
    r = run(["codex", "install", "--home", home]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/não sobrescreve/);
    expect(readFileSync(cfg, "utf8")).toBe(mine);
    expect(readdirSync(join(home, ".codex"))).toHaveLength(files); // no new backup, nothing written
  });
});

describe("diff helpers", () => {
  it("masks secrets and shows context", () => {
    expect(redactLine('    "ANTHROPIC_API_KEY": "sk-ant-xyz",')).toBe('    "ANTHROPIC_API_KEY": "•••",');
    expect(redactLine('bearer_token = "abc"')).toBe('bearer_token = "•••"');
    expect(redactLine('  "env": {')).toBe('  "env": {');
    expect(unifiedDiff("x", "a\nb\n", "a\nb\n")).toContain("nenhuma mudança");
    const d = unifiedDiff("x", "a\nb\n", "a\nc\n");
    expect(d.split("\n")).toEqual(expect.arrayContaining(["--- x", "  a", "- b", "+ c"]));
  });
});

describe("bundled binary", () => {
  const bundle = join(PKG, "dist", "maindy-gateway.mjs");
  it.skipIf(!existsSync(bundle))("dist/maindy-gateway.mjs runs the subcommand with real exit codes", () => {
    const home = userHomeWithClaude({ model: "opus" });
    const ok = spawnSync(process.execPath, [bundle, "integrations", "claude-code", "status", "--home", home], { encoding: "utf8", env: { PATH: process.env.PATH } });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("maindy. × Claude Code — status");
    const dry = spawnSync(process.execPath, [bundle, "integrations", "claude-code", "install", "--dry-run", "--home", home], { encoding: "utf8", env: { PATH: process.env.PATH } });
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain(`node \\"${bundle}\\" statusline`); // command detected at runtime, not hardcoded
    const bad = spawnSync(process.execPath, [bundle, "integrations", "claude-code", "nope"], { encoding: "utf8" });
    expect(bad.status).toBe(64);
    writeFileSync(join(home, ".claude", "settings.json"), "{");
    expect(spawnSync(process.execPath, [bundle, "integrations", "claude-code", "install", "--home", home], { encoding: "utf8" }).status).toBe(3);
  }, 30_000);
});
