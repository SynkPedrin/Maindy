import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { install, uninstall, status, desiredEnv } from "../src/installer.mjs";
import { tempDir } from "./helpers.mjs";

const CLI = fileURLToPath(new URL("../bin/maindy-claude-code.mjs", import.meta.url));

function setup(initial) {
  const home = tempDir();
  const settingsPath = join(home, ".claude", "settings.json");
  if (initial !== undefined) {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath, typeof initial === "string" ? initial : JSON.stringify(initial, null, 2));
  }
  const read = () => JSON.parse(readFileSync(settingsPath, "utf8"));
  const backups = () => (existsSync(join(home, ".claude")) ? readdirSync(join(home, ".claude")).filter((f) => f.includes("maindy-backup")) : []);
  return { home, settingsPath, read, backups };
}

const userSettings = () => ({
  model: "opus",
  permissions: { allow: ["Bash(git status)"] },
  env: { MY_VAR: "x", OTEL_METRICS_EXPORTER: "console" },
  hooks: {
    PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "echo pre" }] }],
    PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "my-formatter" }] }],
  },
});

describe("claude-code installer", () => {
  it("installs into an empty HOME, creating settings.json", () => {
    const t = setup();
    const r = install({ home: t.home });
    expect(r.changed).toBe(true);
    const s = t.read();
    expect(s.env).toEqual(desiredEnv("http://127.0.0.1:8787"));
    expect(s.env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(s.statusLine.type).toBe("command");
    expect(s.statusLine.command).toContain("maindy-statusline.mjs");
    expect(s.hooks.PostToolUse).toHaveLength(1);
    expect(s.hooks.PostToolUse[0].matcher).toBe("Bash");
    expect(s.hooks.PostToolUse[0].hooks[0].command).toContain("maindy-posttooluse.mjs");
    expect(existsSync(join(t.home, ".maindy", "claude-code-install.json"))).toBe(true);
    // state file is private
    const mode = statSync(join(t.home, ".maindy", "claude-code-install.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("preserves user keys, existing hooks and is idempotent", () => {
    const t = setup(userSettings());
    install({ home: t.home, endpoint: "http://127.0.0.1:9999" });
    const s1 = t.read();
    expect(s1.model).toBe("opus");
    expect(s1.permissions).toEqual({ allow: ["Bash(git status)"] });
    expect(s1.env.MY_VAR).toBe("x");
    expect(s1.env.OTEL_METRICS_EXPORTER).toBe("otlp");
    expect(s1.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://127.0.0.1:9999");
    expect(s1.hooks.PreToolUse).toEqual(userSettings().hooks.PreToolUse);
    expect(s1.hooks.PostToolUse).toHaveLength(2);
    expect(s1.hooks.PostToolUse[0]).toEqual(userSettings().hooks.PostToolUse[0]);
    expect(t.backups()).toHaveLength(1);

    const r2 = install({ home: t.home, endpoint: "http://127.0.0.1:9999" });
    expect(r2.changed).toBe(false);
    expect(t.read()).toEqual(s1);
    expect(t.backups()).toHaveLength(1); // no change → no new backup
  });

  it("backup holds the exact previous content", () => {
    const initial = JSON.stringify(userSettings(), null, 4);
    const t = setup(initial);
    const r = install({ home: t.home });
    expect(readFileSync(r.backupPath, "utf8")).toBe(initial);
  });

  it("dry-run writes nothing", () => {
    const t = setup(userSettings());
    const before = readFileSync(t.settingsPath, "utf8");
    const r = install({ home: t.home, dryRun: true });
    expect(r.changed).toBe(true);
    expect(r.settings.env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("1");
    expect(readFileSync(t.settingsPath, "utf8")).toBe(before);
    expect(t.backups()).toHaveLength(0);
    expect(existsSync(join(t.home, ".maindy"))).toBe(false);

    const empty = setup();
    install({ home: empty.home, dryRun: true });
    expect(existsSync(empty.settingsPath)).toBe(false);
  });

  it("keeps a foreign statusLine unless --force-statusline, and restores it on uninstall", () => {
    const foreign = { type: "command", command: "~/bin/my-status.sh", padding: 1 };
    const t = setup({ statusLine: foreign });
    const r = install({ home: t.home });
    expect(t.read().statusLine).toEqual(foreign);
    expect(r.messages.join("\n")).toMatch(/force-statusline/);

    install({ home: t.home, forceStatusline: true });
    expect(t.read().statusLine.command).toContain("maindy-statusline.mjs");

    uninstall({ home: t.home });
    expect(t.read()).toEqual({ statusLine: foreign });
  });

  it("uninstall restores exactly the original settings", () => {
    const t = setup(userSettings());
    install({ home: t.home });
    install({ home: t.home }); // twice: still restores original
    const r = uninstall({ home: t.home });
    expect(r.changed).toBe(true);
    expect(t.read()).toEqual(userSettings());
    expect(existsSync(join(t.home, ".maindy", "claude-code-install.json"))).toBe(false);
  });

  it("uninstall leaves env values the user changed after install", () => {
    const t = setup({});
    install({ home: t.home });
    const s = t.read();
    s.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://collector.example.com";
    writeFileSync(t.settingsPath, JSON.stringify(s));
    uninstall({ home: t.home });
    expect(t.read()).toEqual({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.example.com" } });
  });

  it("uninstall of a file maindy created removes the file", () => {
    const t = setup();
    install({ home: t.home });
    uninstall({ home: t.home });
    expect(existsSync(t.settingsPath)).toBe(false);
  });

  it("refuses invalid JSON without touching it", () => {
    const t = setup("{ not json");
    expect(() => install({ home: t.home })).toThrow(/não é um JSON válido/);
    expect(readFileSync(t.settingsPath, "utf8")).toBe("{ not json");
  });

  it("status reports what is installed", () => {
    const t = setup({});
    expect(status({ home: t.home }).otel).toBe(false);
    install({ home: t.home });
    const st = status({ home: t.home });
    expect(st).toMatchObject({ otel: true, statusLine: true, hook: true, gatewayModeEnv: null, stateFile: true });
  });

  it("CLI works end to end against a temp HOME", () => {
    const t = setup({ theme: "dark" });
    const env = { ...process.env, MAINDY_HOME: "" };
    const dry = execFileSync(process.execPath, [CLI, "install", "--home", t.home, "--dry-run"], { env, encoding: "utf8" });
    expect(dry).toMatch(/simulação/);
    expect(t.read()).toEqual({ theme: "dark" });
    execFileSync(process.execPath, [CLI, "install", "--home", t.home], { env, encoding: "utf8" });
    expect(t.read().env.OTEL_EXPORTER_OTLP_PROTOCOL).toBe("http/json");
    const st = JSON.parse(execFileSync(process.execPath, [CLI, "status", "--home", t.home, "--json"], { env, encoding: "utf8" }));
    expect(st.hook).toBe(true);
    execFileSync(process.execPath, [CLI, "uninstall", "--home", t.home], { env, encoding: "utf8" });
    expect(t.read()).toEqual({ theme: "dark" });
    const bad = spawnSync(process.execPath, [CLI, "frobnicate"], { encoding: "utf8" });
    expect(bad.status).toBe(64);
  });

  it("gateway-binary commands: override, migrate from the node scripts without duplicates, uninstall cleanly", () => {
    const t = setup(userSettings());
    install({ home: t.home }); // node "<…>/maindy-statusline.mjs" (legacy form)
    const sea = `"/Applications/maindy.app/Contents/MacOS/maindy-gateway"`;
    const commands = { statusLine: `${sea} statusline`, hook: `${sea} hook posttooluse` };
    const r = install({ home: t.home, commands });
    expect(r.changed).toBe(true);
    const s = t.read();
    expect(s.statusLine.command).toBe(commands.statusLine);
    const ours = s.hooks.PostToolUse.flatMap((g) => g.hooks).filter((h) => /maindy/.test(h.command));
    expect(ours).toEqual([{ type: "command", command: commands.hook, timeout: 5 }]);
    expect(s.hooks.PostToolUse.find((g) => g.matcher === "Write").hooks[0].command).toBe("my-formatter");
    expect(status({ home: t.home })).toMatchObject({ statusLine: true, hook: true });
    // re-install with the same commands is a no-op
    expect(install({ home: t.home, commands }).changed).toBe(false);
    uninstall({ home: t.home });
    expect(t.read()).toEqual(userSettings());
  });
});

