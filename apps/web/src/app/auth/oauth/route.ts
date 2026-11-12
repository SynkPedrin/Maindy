import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient, getEnabledProviders } from '@/lib/supabase/server';
import { setPendingConsent } from '@/lib/auth/consent-cookie';
import { publicEnv } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const PROVIDERS = ['google', 'github'] as const;
type Provider = (typeof PROVIDERS)[number];

/** Inicia o login social (PKCE). Recebe POST de formulário das páginas /entrar e /cadastro. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const provider = String(form.get('provider') ?? '') as Provider;
  const intent = form.get('intent') === 'signup' ? 'signup' : 'login';
  const back = intent === 'signup' ? '/cadastro' : '/entrar';
  const fail = (code: string) => NextResponse.redirect(new URL(`${back}?erro=${code}`, publicEnv.siteUrl), 303);

  if (!PROVIDERS.includes(provider)) return fail('provider');
  if (!rateLimit(`oauth:${clientIp(request.headers)}`, 20, 60_000)) return fail('oauth');

  const enabled = await getEnabledProviders();
  if (!enabled[provider]) return fail('provider');

  if (intent === 'signup') {
    const accepted = ['terms', 'privacy', 'aiProcessing'].every((k) => form.get(k) === 'on');
    if (!accepted) return fail('consent');
    await setPendingConsent();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${publicEnv.siteUrl}/auth/callback?tipo=${intent}`,
      skipBrowserRedirect: true,
      scopes: provider === 'github' ? 'read:user user:email' : undefined,
    },
  });
  if (error || !data.url) return fail('oauth');
  return NextResponse.redirect(data.url, 303);
}
