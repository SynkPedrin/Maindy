import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { takePendingConsent } from '@/lib/auth/consent-cookie';
import { POLICY_VERSION, publicEnv } from '@/lib/env';
import { safeNextPath } from '@/lib/validation';

/** Retorno do Google/GitHub e dos links de e-mail (confirmação, recuperação de senha). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tipo = params.get('tipo') === 'signup' ? 'signup' : 'login';
  const to = (path: string) => NextResponse.redirect(new URL(path, publicEnv.siteUrl), 303);

  const code = params.get('code');
  if (params.get('error') || !code) {
    return to(`${tipo === 'signup' ? '/cadastro' : '/entrar'}?erro=${params.get('error') ? 'oauth' : 'link'}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to(`/entrar?erro=link`);

  const pending = await takePendingConsent();
  if (pending) {
    const { error: consentError } = await supabase.rpc('record_web_consent', {
      p_kinds: pending.kinds,
      p_policy_version: pending.v,
    });
    if (consentError) console.error('[auth/callback] consent', consentError.message);
  }

  const next = params.get('next');
  if (next) return to(safeNextPath(next, '/'));

  const { data: hasConsent } = await supabase.rpc('has_web_consent', { p_policy_version: POLICY_VERSION });
  if (!hasConsent) return to(`/consentimento?tipo=${tipo}`);
  return to(`/auth/continuar?tipo=${tipo}`);
}
