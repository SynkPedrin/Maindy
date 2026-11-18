import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { install, uninstall, status, findUnmanagedOtel, managedBlock, BEGIN } from "../src/installer.mjs";

const CLI = fileURLToPath(new URL("../bin/maindy-codex.mjs", import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), "maindy-codex-"));
const userToml = `model = "gpt-6.2-sol"
approval_policy = "on-request"

[profiles.fast]
model = "gpt-6-luna"
`;

function cfg(content) {
  const dir = tmp();
  const path = join(dir, "config.toml");
  if (content !== undefined) writeFileSync(path, content);
  return { dir, path, read: () => readFileSync(path, "utf8"), backups: () => readdirSync(dir).filter((f) => f.includes("maindy-backup")) };
}

describe("codex installer", () => {
  it("appends the managed [otel] block preserving user content", () => {
    const c = cfg(userToml);
    const r = install({ config: c.path });
    expect(r.changed).toBe(true);
    const text = c.read();
    expect(text.startsWith(userToml)).toBe(true);
    expect(text).toContain("[otel]");
    expect(text).toContain('exporter = { otlp-http = { endpoint = "http://127.0.0.1:8787/v1/logs", protocol = "json" } }');
    expect(text).toContain("log_user_prompt = false");
    expect(c.backups()).toHaveLength(1);
    expect(readFileSync(join(c.dir, c.backups()[0]), "utf8")).toBe(userToml);
  });

  it("is idempotent and updates the endpoint in place", () => {
    const c = cfg(userToml);
    install({ config: c.path });
    const once = c.read();
    expect(install({ config: c.path }).changed).toBe(false);
    expect(c.read()).toBe(once);
    install({ config: c.path, endpoint: "http://127.0.0.1:9999" });
    expect(c.read().split(BEGIN)).toHaveLength(2);
    expect(c.read()).toContain("http://127.0.0.1:9999/v1/logs");
  });

  it("uninstall restores the original file exactly", () => {
    const c = cfg(userToml);
    install({ config: c.path });
    const r = uninstall({ config: c.path });
    expect(r.changed).toBe(true);
    expect(c.read()).toBe(userToml);
    expect(uninstall({ config: c.path }).changed).toBe(false);
  });

  it("creates a missing config (and parent dir) and dry-run writes nothing", () => {
    const home = tmp();
    const r = install({ home, dryRun: true });
    expect(r.content).toBe(managedBlock());
    expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
    install({ home });
    expect(readFileSync(join(home, ".codex", "config.toml"), "utf8")).toBe(managedBlock());
    uninstall({ home });
    expect(readFileSync(join(home, ".codex", "config.toml"), "utf8")).toBe("");
  });

  it("refuses to clobber an unmanaged [otel] / otel.* config", () => {
    for (const content of [
      userToml + '\n[otel]\nexporter = "none"\n',
      'otel.log_user_prompt = true\nmodel = "x"\n',
      'otel = { exporter = "none" }\n',
      '[otel.exporter.otlp-http]\nendpoint = "x"\n',
    ]) {
      const c = cfg(content);
      let err;
      try {
        install({ config: c.path });
      } catch (e) {
        err = e;
      }
      expect(err?.exitCode).toBe(2);
      expect(err.message).toMatch(/não sobrescreve/);
      expect(c.read()).toBe(content);
      expect(c.backups()).toHaveLength(0);
    }
  });

  it("does not flag otel keys inside other tables or comments", () => {
    expect(findUnmanagedOtel('# [otel]\n[profiles.a]\notel = 1\n')).toBeNull();
    expect(findUnmanagedOtel('x = """\n[otel]\n"""\n')).toBeNull();
    expect(findUnmanagedOtel(managedBlock())).toBeNull();
  });

  it("status reports state", () => {
    const c = cfg(userToml);
    expect(status({ config: c.path }).installed).toBe(false);
    install({ config: c.path });
    expect(status({ config: c.path })).toMatchObject({ installed: true, endpoint: "http://127.0.0.1:8787/v1/logs", unmanagedOtel: null });
  });

  it("CLI install/status/uninstall and conflict exit code", () => {
    const c = cfg(userToml);
    const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    expect(run("install", "--config", c.path, "--dry-run").stdout).toMatch(/simulação/);
    expect(c.read()).toBe(userToml);
    expect(run("install", "--config", c.path).status).toBe(0);
    expect(JSON.parse(run("status", "--config", c.path, "--json").stdout).installed).toBe(true);
    expect(run("uninstall", "--config", c.path).status).toBe(0);
    expect(c.read()).toBe(userToml);
    const bad = cfg("[otel]\n");
    const r = run("install", "--config", bad.path);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/\[otel\]/);
    expect(run("rate-limits").status).toBe(3);
  });
});
