import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const env: Record<string, string> = Object.fromEntries(
  readFileSync(resolve(import.meta.dirname, '../../../../.env.local'), 'utf8')
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => [m[1]!, m[2]!]),
);

export const API = `http://127.0.0.1:${env.API_PORT ?? 4000}`;

export async function login(slug: 'user-demo-001' | 'user-demo-002'): Promise<{ token: string; id: string }> {
  const k = `DEMO_${slug.toUpperCase().replace(/-/g, '_')}`;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env[`${k}_EMAIL`], password: env[`${k}_PASSWORD`] }),
  });
  const j = (await res.json()) as { access_token: string; user: { id: string } };
  if (!j.access_token) throw new Error(`login failed for ${slug}; run node scripts/dev-setup.mjs`);
  return { token: j.access_token, id: j.user.id };
}

export async function api<T = any>(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body: parsed as T, headers: res.headers };
}
