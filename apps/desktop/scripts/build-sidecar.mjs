#!/usr/bin/env node
/**
 * Builds the local gateway (apps/gateway/dist/maindy-gateway.mjs) into a Node Single Executable
 * Application and places it where Tauri expects an `externalBin` sidecar:
 *   src-tauri/binaries/maindy-gateway-<target-triple>[.exe]
 *
 * Node 24 flow: esbuild (ESM bundle → CJS, SEA mains must be CommonJS) → sea-config.json →
 * `node --experimental-sea-config` → copy a Node binary for the target → postject the blob →
 * (macOS) ad-hoc re-sign. When the target arch differs from the host (e.g. x86_64-apple-darwin on
 * Apple Silicon) the matching official Node binary is downloaded from nodejs.org and verified
 * against SHASUMS256.txt.
 *
 * Usage: pnpm --filter @maindy/desktop build:sidecar [--target <triple>] [--strict] [--no-smoke]
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, statSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const repo = path.resolve(pkg, "../..");
const bundle = path.join(repo, "apps/gateway/dist/maindy-gateway.mjs");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const hostTriple = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(/^host: (.+)$/m)[1].trim();
const target = opt("--target") ?? process.env.MAINDY_SIDECAR_TARGET ?? hostTriple;
const isWin = target.includes("windows");
const isMac = target.includes("apple-darwin");
const outDir = path.join(pkg, "src-tauri/binaries");
const out = path.join(outDir, `maindy-gateway-${target}${isWin ? ".exe" : ""}`);

if (!existsSync(bundle)) {
  const msg = `Gateway bundle não encontrado em ${path.relative(repo, bundle)} — rode \`pnpm --filter @maindy/gateway build\` antes. O app funciona sem o gateway ("Gateway local não instalado").`;
  if (flag("--strict")) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(msg);
  process.exit(0);
}

const work = path.join(tmpdir(), `maindy-sea-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

// 1) ESM → CJS. Drop the createRequire banner: CommonJS already has `require`.
const src = readFileSync(bundle, "utf8").replace(
  /^#!.*\nimport \{ createRequire as __maindyCreateRequire \} from 'node:module';\nconst require = __maindyCreateRequire\(import\.meta\.url\);\n/,
  "",
);
const esmIn = path.join(work, "gateway.mjs");
writeFileSync(esmIn, src);
const { build } = await import("esbuild");
const cjs = path.join(work, "gateway.cjs");
await build({ entryPoints: [esmIn], outfile: cjs, bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "warning", legalComments: "none" });

// 2) SEA blob (portable across OS/arch because no code cache / snapshot is embedded)
const blob = path.join(work, "sea-prep.blob");
writeFileSync(
  path.join(work, "sea-config.json"),
  JSON.stringify({ main: cjs, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false }, null, 2),
);
execFileSync(process.execPath, ["--experimental-sea-config", path.join(work, "sea-config.json")], { stdio: "inherit", cwd: work });

// 3) Node binary for the target
function nodeDistName(t) {
  if (t === "aarch64-apple-darwin") return { dist: "darwin-arm64", ext: "tar.gz" };
  if (t === "x86_64-apple-darwin") return { dist: "darwin-x64", ext: "tar.gz" };
  if (t === "x86_64-pc-windows-msvc") return { dist: "win-x64", ext: "zip" };
  if (t === "aarch64-pc-windows-msvc") return { dist: "win-arm64", ext: "zip" };
  if (t === "x86_64-unknown-linux-gnu") return { dist: "linux-x64", ext: "tar.gz" };
  if (t === "aarch64-unknown-linux-gnu") return { dist: "linux-arm64", ext: "tar.gz" };
  throw new Error(`alvo sem binário Node conhecido: ${t}`);
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download falhou ${res.status}: ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

let nodeBin = opt("--node");
if (!nodeBin) {
  if (target === hostTriple) nodeBin = process.execPath;
  else {
    const v = process.version; // same version as the blob builder (required)
    const { dist, ext } = nodeDistName(target);
    const name = `node-${v}-${dist}`;
    const archive = path.join(work, `${name}.${ext}`);
    const base = `https://nodejs.org/dist/${v}`;
    console.log(`baixando ${name}.${ext} …`);
    await download(`${base}/${name}.${ext}`, archive);
    const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text();
    const expected = sums.split("\n").find((l) => l.endsWith(`  ${name}.${ext}`))?.split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    if (!expected || expected !== actual) throw new Error(`SHA-256 do Node não confere (${actual} ≠ ${expected})`);
    execFileSync("tar", ["-xf", archive, "-C", work]);
    nodeBin = isWin ? path.join(work, name, "node.exe") : path.join(work, name, "bin", "node");
  }
}

rmSync(out, { force: true });
copyFileSync(nodeBin, out);
chmodSync(out, 0o755);

// 4) inject (macOS: the copied binary is signed → remove the signature first, re-sign ad hoc after)
if (isMac && process.platform === "darwin") execFileSync("codesign", ["--remove-signature", out], { stdio: "inherit" });
const postject = path.join(pkg, "node_modules/.bin", process.platform === "win32" ? "postject.cmd" : "postject");
const pjArgs = [out, "NODE_SEA_BLOB", blob, "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"];
if (isMac) pjArgs.push("--macho-segment-name", "NODE_SEA");
execFileSync(postject, pjArgs, { stdio: "inherit", shell: process.platform === "win32" });
// Sign exactly like the final bundle does (hardened runtime + JIT entitlements), so the smoke test
// below exercises the same conditions as the shipped .app. Without allow-jit V8 aborts at startup.
if (isMac && process.platform === "darwin") {
  const ent = path.join(pkg, "src-tauri/Entitlements.plist");
  execFileSync("codesign", ["--sign", "-", "--force", "--options", "runtime", "--entitlements", ent, out], { stdio: "inherit" });
}

const size = statSync(out).size;
const sha = createHash("sha256").update(readFileSync(out)).digest("hex");
console.log(`sidecar: ${path.relative(repo, out)} (${(size / 1048576).toFixed(1)} MB) sha256=${sha}`);

// 5) smoke test (only when the binary runs on this host)
if (!flag("--no-smoke") && target === hostTriple) {
  const home = path.join(work, "home");
  mkdirSync(home);
  const version = execFileSync(out, ["--version"], { encoding: "utf8", env: { ...process.env, MAINDY_HOME: home } }).trim();
  const port = 18787 + Math.floor(Math.random() * 500);
  const child = spawn(out, ["--port", String(port), "--home", home], { stdio: "ignore", env: { ...process.env, MAINDY_HOME: home } });
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/maindy/health`);
      ok = r.ok;
    } catch {}
  }
  child.kill("SIGTERM");
  if (!ok) {
    console.error("smoke test falhou: /maindy/health não respondeu");
    process.exit(1);
  }
  console.log(`smoke test ok: --version=${version}, /maindy/health 200 na porta ${port}; arquivos em MAINDY_HOME: ${readdirSync(home).join(", ")}`);
}
rmSync(work, { recursive: true, force: true });
