#!/usr/bin/env node
/**
 * Creates the MAINDY master (super admin) user in Supabase Auth.
 *
 * Requires (server-side only, never in the mobile app):
 *   SUPABASE_URL                 e.g. https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    service-role key of the MAINDY project
 *
 * Optional:
 *   MASTER_EMAIL     default: super@institutoalmada.org
 *   MASTER_PASSWORD  if absent, a strong random password is generated and
 *                    written to .env.local (mode 0600, git-ignored). It is
 *                    never printed to stdout or logs.
 *
 * Usage: node scripts/create-master-user.mjs
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ENV_FILE = resolve(ROOT, '.env.local');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function generatePassword() {
  // 32 random bytes, base64url, with a guaranteed mix of character classes.
  const core = randomBytes(24).toString('base64url');
  return `${core}Aa1!`;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const fileEnv = loadEnvFile(ENV_FILE);
const env = { ...fileEnv, ...process.env };

const SUPABASE_URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
const EMAIL = (env.MASTER_EMAIL || 'super@institutoalmada.org').trim().toLowerCase();

if (!SUPABASE_URL) fail('SUPABASE_URL is not set (see .env.example).');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SUPABASE_URL)) {
  fail('SUPABASE_URL must be https://<ref>.supabase.co or a local http URL.');
}
if (!SERVICE_KEY) fail('SUPABASE_SERVICE_ROLE_KEY is not set (see .env.example).');

// Password: reuse an existing one from .env.local so re-runs stay idempotent.
let password = env.MASTER_PASSWORD;
let generated = false;
if (!password) {
  password = generatePassword();
  generated = true;
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean) : [];
  lines.push(`MASTER_PASSWORD=${password}`);
  writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email: EMAIL,
    password,
    email_confirm: true,
    // app_metadata is set server-side only; users cannot change it from the client.
    app_metadata: { role: 'master', provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Master', created_by: 'scripts/create-master-user.mjs' },
  }),
});

const body = await res.json().catch(() => ({}));

if (res.ok) {
  console.log(`master user created: id=${body.id} email=${body.email} role=${body.app_metadata?.role}`);
  if (generated) console.log(`password generated and stored in ${ENV_FILE} (MASTER_PASSWORD, mode 0600).`);
  process.exit(0);
}

const msg = JSON.stringify(body);
if (res.status === 422 || /already/i.test(msg)) {
  console.log(`master user already exists for ${EMAIL}; nothing changed.`);
  process.exit(0);
}

fail(`Supabase responded ${res.status}: ${msg.replace(SERVICE_KEY, '[redacted]')}`);
