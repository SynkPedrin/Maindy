import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { WaitlistInput } from '@/lib/validation';

export type WaitlistResult =
  | { status: 'created' }
  | { status: 'duplicate' }
  | { status: 'unavailable' } // backend não configurado: nunca simulamos sucesso
  | { status: 'error' };

export interface WaitlistAdapter {
  add(entry: Omit<WaitlistInput, 'company'>, meta: { policyVersion: string; source: string }): Promise<WaitlistResult>;
}

const supabaseAdapter = (): WaitlistAdapter | null => {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  return {
    async add(entry, meta) {
      const { error } = await admin.from('waitlist').insert({
        name: entry.name,
        email: entry.email,
        platform: entry.platform,
        main_expectation: entry.mainExpectation || null,
        consent: entry.consent,
        policy_version: meta.policyVersion,
        source: meta.source,
      });
      if (!error) return { status: 'created' };
      if (error.code === '23505') return { status: 'duplicate' };
      console.error('[waitlist] insert failed', error.code, error.message);
      return { status: 'error' };
    },
  };
};

const unavailableAdapter: WaitlistAdapter = {
  async add() {
    console.warn('[waitlist] SUPABASE_SERVICE_ROLE_KEY ausente: inscrição NÃO foi persistida.');
    return { status: 'unavailable' };
  },
};

export function getWaitlistAdapter(): WaitlistAdapter {
  return supabaseAdapter() ?? unavailableAdapter;
}
