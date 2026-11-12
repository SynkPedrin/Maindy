import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildHandoffUrl } from '@/lib/auth/handoff';
import { POLICY_VERSION, publicEnv } from '@/lib/env';

/**
 * Entrega a sessão ao sistema MAINDY e encerra a cópia local da LP.
 * Os cookies são apagados SEM chamar signOut: signOut revogaria no servidor a mesma sessão que o app acabou de receber.
 */
export async function GET(request: NextRequest) {
  const tipo = request.nextUrl.searchParams.get('tipo') === 'signup' ? 'signup' : 'login';
  const supabase = await createSupabaseServerClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.redirect(new URL('/entrar?erro=session', publicEnv.siteUrl), 303);
  }

  const { data: hasConsent } = await supabase.rpc('has_web_consent', { p_policy_version: POLICY_VERSION });
  if (!hasConsent) {
    return NextResponse.redirect(new URL(`/consentimento?tipo=${tipo}`, publicEnv.siteUrl), 303);
  }

  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return NextResponse.redirect(new URL('/entrar?erro=session', publicEnv.siteUrl), 303);

  const target = buildHandoffUrl(publicEnv.appUrl, session, tipo);

  const store = await cookies();
  for (const c of store.getAll()) if (c.name.startsWith('sb-')) store.delete(c.name);

  const response = NextResponse.redirect(target, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
