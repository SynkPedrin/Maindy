#!/usr/bin/env node
/**
 * Builds the MAINDY API as a Vercel prebuilt deployment (Build Output API v3):
 *   deploy/api/.vercel/output/{config.json, functions/index.func/*}
 * One esbuild bundle of apps/api/src/serverless.ts + dependencies (no monorepo install on Vercel).
 * Deploy: cd deploy/api && npx vercel deploy --prebuilt --prod
 */
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(resolve(ROOT, 'apps/obsidian-plugin/package.json'));
const esbuild = require('esbuild');

const out = resolve(ROOT, 'deploy/api/.vercel/output');
const fn = resolve(out, 'functions/index.func');
mkdirSync(fn, { recursive: true });

await esbuild.build({
  entryPoints: [resolve(ROOT, 'apps/api/src/serverless.ts')],
  outfile: resolve(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  minify: false,
  // never loaded on Vercel (EMBEDDINGS_PROVIDER=none|supabase); keeps the function small
  external: ['@huggingface/transformers', 'onnxruntime-node', 'pg-native', 'sharp'],
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
  nodePaths: [resolve(ROOT, 'apps/api/node_modules'), resolve(ROOT, 'node_modules')],
});

writeFileSync(resolve(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  resolve(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60, memory: 1024, regions: [process.env.VERCEL_FN_REGION || 'gru1'] }, null, 2),
);
// Optional Android build served as a static file: https://<api>/download
const apk = process.env.MAINDY_APK ?? resolve(homedir(), 'MAINDY/downloads/maindy.apk');
const routes = [];
if (existsSync(apk)) {
  const st = resolve(out, 'static');
  mkdirSync(st, { recursive: true });
  copyFileSync(apk, resolve(st, 'maindy.apk'));
  const mb = Math.round(statSync(apk).size / 1e6);
  writeFileSync(
    resolve(st, 'download.html'),
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MAINDY</title>
<body style="margin:0;background:#05082B;color:#F8F8FF;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
<div><h1 style="font-size:34px;margin:0 0 8px">maindy<span style="color:#7600FF">.</span></h1>
<p style="color:#A8AAC6">Versão de teste para Android</p>
<a href="/download/maindy.apk" style="display:inline-block;margin-top:16px;padding:16px 28px;border-radius:999px;background:#7600FF;color:#fff;text-decoration:none;font-weight:600">Baixar APK (${mb} MB)</a>
<p style="color:#A8AAC6;font-size:13px;margin-top:16px">Depois de baixar, permita “instalar apps desconhecidos” para o navegador.</p></div></body></html>`,
  );
  routes.push(
    { src: '^/download/?$', dest: '/download.html' },
    { src: '^/download/maindy\\.apk$', dest: '/maindy.apk', headers: { 'content-type': 'application/vnd.android.package-archive', 'content-disposition': 'attachment; filename="maindy.apk"' } },
    { handle: 'filesystem' },
  );
  console.log(`apk ${mb} MB → /download`);
}
routes.push({ src: '/(.*)', dest: '/index' });
writeFileSync(resolve(out, 'config.json'), JSON.stringify({ version: 3, routes }, null, 2));
console.log('built', fn);
