import { decryptSecret, encryptSecret, IntegrationUnavailableError } from '@maindy/core';
import type { Db } from '../db.js';

/**
 * Google OAuth (Gmail + Google Calendar) adapter. Real HTTP against Google's documented
 * endpoints. Tokens are encrypted with AES-256-GCM before they touch the database and the
 * table holding them is unreadable by client roles. Requires GOOGLE_CLIENT_ID/SECRET.
 */

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
}

export function googleAuthUrl(cfg: GoogleConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(cfg: GoogleConfig, code: string): Promise<TokenSet> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + j.expires_in * 1000, scope: j.scope };
}

async function refresh(cfg: GoogleConfig, t: TokenSet): Promise<TokenSet> {
  if (!t.refresh_token) throw new IntegrationUnavailableError('google', 'a sessão do Google expirou; reconecte em Ajustes');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new IntegrationUnavailableError('google', `falha ao renovar o acesso (HTTP ${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  return { ...t, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 };
}

/** Service-context storage of tokens (provider_credentials is not readable by user roles). */
export async function storeTokens(service: Db, userId: string, integrationId: string, tokens: TokenSet, key: string): Promise<void> {
  const sealed = encryptSecret(JSON.stringify(tokens), key);
  await service.query(
    `insert into maindy.provider_credentials (user_id, integration_id, ciphertext, iv, auth_tag) values ($1,$2,$3,$4,$5)
     on conflict (integration_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, auth_tag = excluded.auth_tag, created_at = now()`,
    [userId, integrationId, sealed.ciphertext, sealed.iv, sealed.authTag],
  );
}

export class GoogleClient {
  constructor(private readonly cfg: GoogleConfig | null, private readonly service: <T>(fn: (db: Db) => Promise<T>) => Promise<T>, private readonly key: string, private readonly userId: string) {}

  private async token(): Promise<string> {
    if (!this.cfg) throw new IntegrationUnavailableError('google', 'integração Google não configurada no servidor');
    return this.service(async (db) => {
      const { rows } = await db.query(
        `select c.ciphertext, c.iv, c.auth_tag, c.integration_id from maindy.provider_credentials c
         join maindy.integrations i on i.id = c.integration_id
         where c.user_id = $1 and i.provider = 'google' and i.status = 'connected'`,
        [this.userId],
      );
      if (!rows[0]) throw new IntegrationUnavailableError('gmail');
      let t = JSON.parse(decryptSecret({ ciphertext: rows[0].ciphertext, iv: rows[0].iv, authTag: rows[0].auth_tag }, this.key)) as TokenSet;
      if (t.expires_at < Date.now() + 60_000) {
        t = await refresh(this.cfg!, t);
        await storeTokens(db, this.userId, rows[0].integration_id, t, this.key);
      }
      return t.access_token;
    });
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.token();
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Google API HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private static rfc822(to: string, subject: string, body: string): string {
    const encSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const msg = [`To: ${to}`, `Subject: ${encSubject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
    return Buffer.from(msg, 'utf8').toString('base64url');
  }

  async createDraft(to: string, subject: string, body: string): Promise<{ draftId: string }> {
    const r = await this.call<{ id: string }>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', body: JSON.stringify({ message: { raw: GoogleClient.rfc822(to, subject, body) } }) });
    return { draftId: r.id };
  }

  async send(to: string, subject: string, body: string): Promise<{ messageId: string }> {
    const r = await this.call<{ id: string }>('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: GoogleClient.rfc822(to, subject, body) }) });
    return { messageId: r.id };
  }

  async searchMessages(q: string, max = 10): Promise<Array<{ id: string; snippet: string }>> {
    const list = await this.call<{ messages?: Array<{ id: string }> }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${max}`);
    const out: Array<{ id: string; snippet: string }> = [];
    for (const m of list.messages ?? []) {
      const full = await this.call<{ id: string; snippet: string }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata`);
      out.push({ id: full.id, snippet: full.snippet });
    }
    return out;
  }

  async listCalendarEvents(fromIso: string, toIso: string): Promise<Array<{ id: string; summary: string; start: string; end: string; location?: string }>> {
    const r = await this.call<{ items?: Array<{ id: string; summary?: string; location?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }> }>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(fromIso)}&timeMax=${encodeURIComponent(toIso)}`,
    );
    return (r.items ?? []).map((e) => ({ id: e.id, summary: e.summary ?? '(sem título)', start: e.start.dateTime ?? e.start.date ?? '', end: e.end.dateTime ?? e.end.date ?? '', ...(e.location ? { location: e.location } : {}) }));
  }
}
