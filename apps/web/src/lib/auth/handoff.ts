export type HandoffType = 'login' | 'signup';

export interface HandoffSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
}

/**
 * Monta a URL de entrega da sessão para o sistema MAINDY.
 * Contrato combinado com o app: <APP_URL>/auth/callback#access_token=…&refresh_token=…&expires_in=…&token_type=bearer&type=…
 * Os tokens vão no fragmento (#), que o navegador nunca envia a servidores nem a logs de acesso.
 */
export function buildHandoffUrl(appUrl: string, session: HandoffSession, type: HandoffType): string {
  const url = new URL('/auth/callback', appUrl);
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in),
    token_type: 'bearer',
    type,
  });
  url.hash = fragment.toString();
  return url.toString();
}
