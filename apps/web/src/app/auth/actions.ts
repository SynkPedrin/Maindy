'use server';

import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { setPendingConsent } from '@/lib/auth/consent-cookie';
import { authErrorMessage } from '@/lib/auth/errors';
import { POLICY_VERSION, publicEnv } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import {
  consentSchema,
  forgotSchema,
  loginSchema,
  resetSchema,
  signupSchema,
  type ConsentInput,
  type LoginInput,
  type SignupInput,
} from '@/lib/validation';

export type ActionResult =
  | { ok: true; next?: string; message?: string }
  | { ok: false; error: string; field?: string };

async function limited(scope: string, limit = 10): Promise<boolean> {
  const ip = clientIp(await headers());
  return !rateLimit(`${scope}:${ip}`, limit, 60_000);
}

const TOO_MANY: ActionResult = { ok: false, error: 'Muitas tentativas em pouco tempo. Aguarde um instante.' };

export async function loginAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  if (await limited('login')) return TOO_MANY;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authErrorMessage(error) };
  return { ok: true, next: '/auth/continuar?tipo=login' };
}

export async function signupAction(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? 'Dados inválidos.', field: issue?.path.join('.') };
  }
  if (await limited('signup', 5)) return TOO_MANY;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: `${publicEnv.siteUrl}/auth/callback?tipo=signup`,
    },
  });
  if (error) return { ok: false, error: authErrorMessage(error) };

  // GoTrue devolve user sem identities quando o e-mail já existe (proteção contra enumeração).
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, error: authErrorMessage({ code: 'user_already_exists' }) };
  }

  if (!data.session) {
    // Confirmação por e-mail ligada: o consentimento é gravado quando o link for aberto.
    await setPendingConsent();
    return { ok: true, message: 'Enviamos um link de confirmação para o seu e-mail.' };
  }

  const { error: consentError } = await supabase.rpc('record_web_consent', {
    p_kinds: ['terms', 'privacy', 'ai_processing'],
    p_policy_version: POLICY_VERSION,
  });
  if (consentError) {
    console.error('[signup] consent', consentError.message);
    return { ok: true, next: '/consentimento?tipo=signup' };
  }
  return { ok: true, next: '/auth/continuar?tipo=signup' };
}

export async function consentAction(input: ConsentInput, tipo: 'login' | 'signup'): Promise<ActionResult> {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Aceite para continuar.' };

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: 'Sua sessão expirou. Entre novamente.' };

  const { error } = await supabase.rpc('record_web_consent', {
    p_kinds: ['terms', 'privacy', 'ai_processing'],
    p_policy_version: POLICY_VERSION,
  });
  if (error) return { ok: false, error: 'Não foi possível registrar seu consentimento. Tente novamente.' };
  return { ok: true, next: `/auth/continuar?tipo=${tipo}` };
}

export async function forgotPasswordAction(input: { email: string }): Promise<ActionResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };
  if (await limited('forgot', 3)) return TOO_MANY;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.siteUrl}/auth/callback?next=/redefinir-senha`,
  });
  if (error && error.status === 429) return TOO_MANY;
  // Mesma resposta exista ou não a conta, para não revelar quem é cliente.
  return { ok: true, message: 'Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha.' };
}

export async function resetPasswordAction(input: { password: string; confirm: string }): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Senha inválida.' };

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: 'O link expirou. Peça um novo.' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorMessage(error) };
  return { ok: true, next: '/auth/continuar?tipo=login' };
}
