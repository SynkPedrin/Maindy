import { createRemoteJWKSet, jwtVerify, decodeProtectedHeader, type JWTPayload } from 'jose';
import type { UserClaims } from './db.js';

/**
 * Supabase JWT verification. Asymmetric tokens (ES256/RS256) are verified with the project's
 * JWKS; legacy HS256 tokens with SUPABASE_JWT_SECRET. Only `authenticated` users are accepted.
 */
export class AuthVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly secret: Uint8Array | null;

  constructor(private readonly supabaseUrl: string, jwtSecret: string | null) {
    this.jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`), { cooldownDuration: 60_000 });
    this.secret = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;
  }

  async verify(token: string): Promise<UserClaims & { email?: string; appRole: string }> {
    const { alg } = decodeProtectedHeader(token);
    let payload: JWTPayload;
    const opts = { issuer: `${this.supabaseUrl}/auth/v1`, audience: 'authenticated' };
    if (alg === 'HS256') {
      if (!this.secret) throw new Error('HS256 token but SUPABASE_JWT_SECRET is not configured');
      ({ payload } = await jwtVerify(token, this.secret, { ...opts, algorithms: ['HS256'] }));
    } else {
      ({ payload } = await jwtVerify(token, this.jwks, { ...opts, algorithms: ['ES256', 'RS256'] }));
    }
    if (!payload.sub || payload.role !== 'authenticated') throw new Error('not an authenticated user token');
    const appMeta = (payload.app_metadata ?? {}) as { role?: string };
    return { ...(payload as Record<string, unknown>), sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined, appRole: appMeta.role === 'master' ? 'master' : 'user' };
  }
}
