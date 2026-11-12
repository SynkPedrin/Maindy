#!/usr/bin/env node
/**
 * Local development bootstrap (idempotent):
 *  - creates two demo users (user-demo-001 / user-demo-002) in the LOCAL Supabase Auth,
 *    with random passwords stored in .env.local (mode 0600, git-ignored);
 *  - provisions each user's independent Obsidian vault through the API;
 *  - adds readable symlinks ~/MAINDY/development/users/user-demo-00X → <uuid>.
 * Refuses to run against a non-local Supabase URL.
 *
 * Usage: node scripts/dev-setup.mjs   (API must be running: pnpm dev:api)
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync, symlinkSync, lstatSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ENV_FILE = resolve(ROOT, '.env.local');
const env = Object.fromEntries(
  (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SUPABASE_ANON_KEY;
const API = `http://127.0.0.1:${env.API_PORT ?? 4000}`;
if (!SUPABASE_URL || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(SUPABASE_URL)) {
  console.error('dev-setup only runs against a local Supabase (SUPABASE_URL=http://127.0.0.1:54321).');
  process.exit(1);
}

function saveEnv(k, v) {
  const lines = readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => l && !l.startsWith(`${k}=`));
  lines.push(`${k}=${v}`);
  writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
  env[k] = v;
}

async function ensureUser(slug, displayName) {
  const emailKey = `DEMO_${slug.toUpperCase().replace(/-/g, '_')}_EMAIL`;
  const passKey = emailKey.replace('_EMAIL', '_PASSWORD');
  const email = env[emailKey] ?? `${slug}@maindy.local`;
  let password = env[passKey];
  if (!password) {
    password = `${randomBytes(18).toString('base64url')}Aa1!`;
    saveEnv(emailKey, email);
    saveEnv(passKey, password);
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: displayName } }),
  });
  if (!res.ok && res.status !== 422) throw new Error(`create ${slug}: HTTP ${res.status} ${await res.text()}`);
  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  if (!login.access_token) throw new Error(`login ${slug} failed: ${JSON.stringify(login).slice(0, 200)}`);
  return { slug, email, id: login.user.id, token: login.access_token };
}

const users = [await ensureUser('user-demo-001', 'Ana'), await ensureUser('user-demo-002', 'Bruno')];
for (const u of users) {
  const r = await fetch(`${API}/v1/vaults/provision`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`provision ${u.slug}: HTTP ${r.status} ${await r.text()}`);
  const usersDir = join(env.MAINDY_STORAGE_ROOT, 'users');
  mkdirSync(usersDir, { recursive: true });
  const link = join(usersDir, u.slug);
  try {
    if (lstatSync(link).isSymbolicLink()) unlinkSync(link);
  } catch {}
  if (!existsSync(link)) symlinkSync(u.id, link);
  console.log(`${u.slug}: ${u.email} id=${u.id} vault=${join(usersDir, u.id, 'managed-vault')}`);
}
mkdirSync(join(env.MAINDY_STORAGE_ROOT, 'system', 'templates'), { recursive: true });
mkdirSync(join(env.MAINDY_STORAGE_ROOT, 'system', 'schemas'), { recursive: true });
mkdirSync(join(env.MAINDY_STORAGE_ROOT, 'backups'), { recursive: true });
console.log('done. Demo passwords are in .env.local (DEMO_USER_DEMO_00X_PASSWORD).');
