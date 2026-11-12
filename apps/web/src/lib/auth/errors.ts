/** Traduz erros do Supabase Auth para mensagens claras em português. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return 'Algo deu errado. Tente novamente.';
  const code = error.code ?? '';
  const msg = (error.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return 'E-mail ou senha incorretos.';
  if (code === 'user_already_exists' || code === 'email_exists' || msg.includes('already registered'))
    return 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.';
  if (code === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres com letras e números.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429)
    return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.';
  if (code === 'signup_disabled') return 'Novos cadastros estão temporariamente fechados.';
  if (code === 'validation_failed' || msg.includes('provider is not enabled'))
    return 'Este método de acesso ainda não está disponível.';
  if (msg.includes('fetch failed') || msg.includes('econnrefused'))
    return 'Não foi possível falar com o servidor de autenticação. Tente novamente em instantes.';
  return 'Não foi possível concluir. Tente novamente.';
}

/** Mensagens para códigos de erro passados por query string nas páginas de login/cadastro. */
export const QUERY_ERRORS: Record<string, string> = {
  oauth: 'Não foi possível concluir o acesso com o provedor. Tente novamente.',
  provider: 'Este método de acesso ainda não está disponível.',
  consent: 'Para criar sua conta é preciso aceitar os termos e a política de privacidade.',
  session: 'Sua sessão expirou. Entre novamente.',
  link: 'O link é inválido ou expirou. Peça um novo.',
};
