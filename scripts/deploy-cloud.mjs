#!/usr/bin/env node
/**
 * One-shot cloud setup: Supabase (provisioned by the Vercel marketplace integration) +
 * API on Vercel (project `maindy-api`, linked in deploy/api).
 *
 *   node scripts/deploy-cloud.mjs
 *
 * Steps (idempotent): pull the integration env → apply migrations → ensure app secrets
 * on Vercel → build + deploy → create the master user → schedule the reminder cron →
 * write the public app config to .env.cloud (0600, git-ignored).
 * Never prints secret values.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEPLOY = resolve(ROOT, 'deploy/api');
const CLOUD_FILE = resolve(ROOT, '.env.cloud');
const PULLED = resolve(DEPLOY, '.env.vercel-production');
const require = createRequire(resolve(ROOT, 'apps/api/package.json'));
const pg = require('pg');

const parse = (path) => {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
  }
  return out;
};
const step = (s) => console.log(`\n▸ ${s}`);
const vercel = (args, opts = {}) => execFileSync('npx', ['vercel', ...args, '--non-interactive'], { cwd: DEPLOY, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

step('Lendo variáveis da integração Supabase na Vercel');
vercel(['env', 'pull', PULLED, '--environment=production', '--yes']);
chmodSync(PULLED, 0o600);
const v = parse(PULLED);
const SUPABASE_URL = (v.SUPABASE_URL || v.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = v.SUPABASE_ANON_KEY || v.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE = v.SUPABASE_SERVICE_ROLE_KEY || '';
const DIRECT = v.POSTGRES_URL_NON_POOLING || '';
for (const [k, val] of Object.entries({ SUPABASE_URL, ANON, SERVICE, DIRECT, POOLER: v.POSTGRES_URL })) {
  if (!val) throw new Error(`Variável ausente vinda da integração: ${k}`);
}
console.log(`  Supabase: ${SUPABASE_URL}`);

const pgClient = () => {
  const u = new URL(DIRECT);
  for (const p of ['sslmode', 'supa', 'pgbouncer']) u.searchParams.delete(p);
  return new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
};

step('Aplicando migrations');
{
  const u = new URL(DIRECT);
  u.searchParams.set('sslmode', 'require');
  u.searchParams.delete('supa');
  execFileSync('pnpm', ['exec', 'supabase', 'db', 'push', '--db-url', u.toString(), '--include-all', '--yes'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
}

step('Segredos do app na Vercel');
const cloud = parse(CLOUD_FILE);
const local = parse(resolve(ROOT, '.env.local'));
cloud.MAINDY_CREDENTIALS_KEY ||= randomBytes(32).toString('hex');
cloud.CRON_SECRET ||= randomBytes(24).toString('base64url');
const existing = vercel(['env', 'ls', 'production']);
const ensure = (name, value, { force = false } = {}) => {
  if (!value) return console.log(`  ${name}: (vazio, ignorado)`);
  const has = new RegExp(`^\\s*${name}\\s`, 'm').test(existing);
  if (has && !force) return console.log(`  ${name}: já existe`);
  vercel(['env', 'add', name, 'production', '--sensitive', '--force', '--yes'], { input: value });
  console.log(`  ${name}: definido`);
};
ensure('MAINDY_CREDENTIALS_KEY', cloud.MAINDY_CREDENTIALS_KEY);
ensure('CRON_SECRET', cloud.CRON_SECRET);
ensure('CORS_ORIGINS', '*');
ensure('MAINDY_STORAGE_ROOT', '/tmp/maindy');
ensure('MAINDY_SCHEDULER', 'off');
ensure('EMBEDDINGS_PROVIDER', 'none');
ensure('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY || local.ANTHROPIC_API_KEY, { force: true });

step('Build e deploy da API');
execFileSync('pnpm', ['--filter', '@maindy/core', 'build'], { cwd: ROOT, stdio: 'ignore' });
execFileSync('node', ['scripts/build-vercel-api.mjs'], { cwd: ROOT, stdio: 'inherit' });
const out = vercel(['deploy', '--prebuilt', '--prod', '--yes']);
const deployUrl = (out.match(/https:\/\/[^\s]+\.vercel\.app/g) ?? []).pop();
const API = process.env.MAINDY_API_URL || 'https://maindy-api.vercel.app';
console.log(`  deploy: ${deployUrl ?? '(sem URL na saída)'}\n  produção: ${API}`);

step('Usuário master');
execFileSync('node', ['scripts/create-master-user.mjs'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE } });

step('Agendador de lembretes (pg_cron)');
{
  const c = pgClient();
  await c.connect();
  const { rows } = await c.query('select maindy.schedule_reminder_dispatch($1, $2) as job', [`${API}/v1/internal/reminders/dispatch`, cloud.CRON_SECRET]);
  await c.end();
  console.log(`  job ${rows[0].job}`);
}

cloud.MAINDY_API_URL = API;
cloud.EXPO_PUBLIC_API_URL = API;
cloud.EXPO_PUBLIC_SUPABASE_URL = SUPABASE_URL;
cloud.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON;
writeFileSync(CLOUD_FILE, Object.entries(cloud).map(([k, val]) => `${k}=${val}`).join('\n') + '\n', { mode: 0o600 });
chmodSync(CLOUD_FILE, 0o600);
console.log(`\n✓ Pronto. Configuração pública do app em .env.cloud`);
