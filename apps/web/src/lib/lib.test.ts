import { describe, expect, it } from 'vitest';
import { buildHandoffUrl } from './auth/handoff';
import { authErrorMessage } from './auth/errors';
import { rateLimit } from './rate-limit';
import { loginSchema, safeNextPath, signupSchema, waitlistSchema } from './validation';

describe('buildHandoffUrl', () => {
  it('coloca os tokens no fragmento, nunca na query', () => {
    const url = new URL(
      buildHandoffUrl('http://localhost:8081', { access_token: 'a.b.c', refresh_token: 'r1', expires_in: 3600 }, 'signup'),
    );
    expect(url.origin + url.pathname).toBe('http://localhost:8081/auth/callback');
    expect(url.search).toBe('');
    const f = new URLSearchParams(url.hash.slice(1));
    expect(Object.fromEntries(f)).toEqual({
      access_token: 'a.b.c',
      refresh_token: 'r1',
      expires_in: '3600',
      token_type: 'bearer',
      type: 'signup',
    });
  });

  it('funciona com esquema nativo do app', () => {
    const url = buildHandoffUrl('maindy://', { access_token: 'x', refresh_token: 'y', expires_in: 1 }, 'login');
    expect(url.startsWith('maindy://')).toBe(true);
    expect(url).toContain('#access_token=x');
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/redefinir-senha', '/redefinir-senha'],
    ['//evil.com', '/auth/continuar'],
    ['https://evil.com', '/auth/continuar'],
    ['/\\evil.com', '/auth/continuar'],
    [null, '/auth/continuar'],
  ])('%s -> %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('schemas', () => {
  const okSignup = { name: 'Ana', email: 'ANA@Example.com ', password: 'abc12345', terms: true, privacy: true, aiProcessing: true };

  it('cadastro normaliza e-mail e exige os três consentimentos', () => {
    const r = signupSchema.safeParse(okSignup);
    expect(r.success && r.data.email).toBe('ana@example.com');
    expect(signupSchema.safeParse({ ...okSignup, aiProcessing: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...okSignup, terms: undefined }).success).toBe(false);
  });

  it('cadastro exige senha com letras e números', () => {
    expect(signupSchema.safeParse({ ...okSignup, password: 'abcdefgh' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...okSignup, password: '12345678' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...okSignup, password: 'a1' }).success).toBe(false);
  });

  it('login valida e-mail', () => {
    expect(loginSchema.safeParse({ email: 'nao-e-email', password: 'x' }).success).toBe(false);
  });

  it('lista de espera exige consentimento e plataforma válida, e barra honeypot', () => {
    const base = { name: 'Ana', email: 'a@b.co', platform: 'android', consent: true };
    expect(waitlistSchema.safeParse(base).success).toBe(true);
    expect(waitlistSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(waitlistSchema.safeParse({ ...base, platform: 'windows' }).success).toBe(false);
    expect(waitlistSchema.safeParse({ ...base, company: 'bot' }).success).toBe(false);
    expect(waitlistSchema.safeParse({ ...base, mainExpectation: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('rateLimit', () => {
  it('bloqueia depois do limite e libera na próxima janela', () => {
    const key = `t-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(key, 2, 1000, 0))).toEqual([true, true, false]);
    expect(rateLimit(key, 2, 1000, 1001)).toBe(true);
  });
});

describe('authErrorMessage', () => {
  it('traduz erros comuns', () => {
    expect(authErrorMessage({ code: 'invalid_credentials' })).toMatch(/incorretos/);
    expect(authErrorMessage({ code: 'user_already_exists' })).toMatch(/Já existe/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Muitas tentativas/);
  });
});
