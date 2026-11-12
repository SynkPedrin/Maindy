import 'server-only';
import { cookies } from 'next/headers';
import { POLICY_VERSION } from '@/lib/env';

const NAME = 'maindy_pending_consent';
const KINDS = ['terms', 'privacy', 'ai_processing'] as const;

/** Guarda por 15 min que o visitante aceitou os termos antes de ir ao Google/GitHub ou de confirmar o e-mail. */
export async function setPendingConsent(): Promise<void> {
  const store = await cookies();
  store.set(NAME, JSON.stringify({ v: POLICY_VERSION, kinds: KINDS }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 15,
  });
}

export async function takePendingConsent(): Promise<{ v: string; kinds: string[] } | null> {
  const store = await cookies();
  const raw = store.get(NAME)?.value;
  if (!raw) return null;
  store.delete(NAME);
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; kinds?: unknown };
    if (parsed.v !== POLICY_VERSION || !Array.isArray(parsed.kinds)) return null;
    const kinds = parsed.kinds.filter((k): k is string => KINDS.includes(k as (typeof KINDS)[number]));
    return kinds.length ? { v: parsed.v, kinds } : null;
  } catch {
    return null;
  }
}

export const CONSENT_KINDS = KINDS;
