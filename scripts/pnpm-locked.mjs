#!/usr/bin/env node
// Serializes pnpm install/add across concurrent agents. Usage: node scripts/pnpm-locked.mjs add zod --filter @maindy/api
import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
const lock = new URL("../.pnpm-install.lock", import.meta.url).pathname;
const sab = new Int32Array(new SharedArrayBuffer(4));
const started = Date.now();
for (;;) {
  try { mkdirSync(lock); break; } catch {
    try { if (Date.now() - statSync(lock).mtimeMs > 10 * 60_000) { rmdirSync(lock); continue; } } catch {}
    if (Date.now() - started > 15 * 60_000) { console.error("pnpm lock timeout"); process.exit(1); }
    Atomics.wait(sab, 0, 0, 2000);
  }
}
let code = 1;
try { code = spawnSync("pnpm", process.argv.slice(2), { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname }).status ?? 1; }
finally { rmdirSync(lock); }
process.exit(code);
