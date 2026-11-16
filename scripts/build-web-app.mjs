#!/usr/bin/env node
/**
 * Builds the Expo app for the web (static SPA) pointing at the cloud and prepares the Vercel
 * prebuilt output in deploy/app/.vercel/output. Public config comes from .env.cloud.
 *   node scripts/build-web-app.mjs && (cd deploy/app && npx vercel deploy --prebuilt --prod)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = resolve(ROOT, 'deploy/app/.vercel/output');
const cloud = {};
for (const line of readFileSync(resolve(ROOT, '.env.cloud'), 'utf8').split('\n')) {
  const m = line.match(/^(EXPO_PUBLIC_[A-Z_]+)=(.*)$/); // only public values reach the bundle
  if (m) cloud[m[1]] = m[2];
}
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', ...cloud };
execFileSync(resolve(ROOT, 'apps/mobile/node_modules/.bin/expo'), ['export', '-p', 'web', '--output-dir', resolve(OUT, 'static')], {
  cwd: resolve(ROOT, 'apps/mobile'),
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
});

const index = resolve(OUT, 'static/index.html');
let html = readFileSync(index, 'utf8');
html = html.replace(/<html lang="[^"]*">/, '<html lang="pt-BR" translate="no">');
const head = [
  '<meta name="google" content="notranslate">',
  '<meta name="theme-color" content="#05082B">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="MAINDY">',
].join('');
if (!html.includes('notranslate')) html = html.replace('</head>', `${head}</head>`);
html = html.replace(/<title>[^<]*<\/title>/, '<title>MAINDY</title>');
writeFileSync(index, html);

writeFileSync(
  resolve(OUT, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/_expo/(.*)', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
if (!existsSync(resolve(OUT, 'static/index.html'))) throw new Error('export failed');
console.log('web app ready in', OUT);
