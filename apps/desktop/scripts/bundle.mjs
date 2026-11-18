#!/usr/bin/env node
// `tauri build` wrapper: bundles the gateway sidecar only when its binary exists for the target,
// so the app still builds (and runs, "Gateway local não instalado") without it.
// Usage: pnpm --filter @maindy/desktop bundle [--target <triple>] [--bundles app,dmg] [...extra tauri args]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const ti = args.indexOf("--target");
const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)[1].trim();
const target = ti >= 0 ? args[ti + 1] : host;
const exe = target.includes("windows") ? ".exe" : "";
const sidecar = path.join(pkg, "src-tauri/binaries", `maindy-gateway-${target}${exe}`);
const extra = existsSync(sidecar) ? ["--config", "src-tauri/tauri.sidecar.conf.json"] : [];
console.log(existsSync(sidecar) ? `sidecar incluído: ${path.basename(sidecar)}` : "sidecar ausente: build sem gateway local");
const r = spawnSync("pnpm", ["exec", "tauri", "build", ...extra, ...args], { cwd: pkg, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
