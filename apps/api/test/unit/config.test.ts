import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, redact } from '@maindy/core';
import { ConfigError, loadConfig } from '../../src/config.js';
import { toVectorLiteral } from '../../src/embeddings.js';

const base = {
  DATABASE_URL: 'postgresql://x',
  SUPABASE_URL: 'http://127.0.0.1:54321/',
  MAINDY_STORAGE_ROOT: '/tmp/maindy',
  MAINDY_CREDENTIALS_KEY: 'a'.repeat(64),
};

describe('config', () => {
  it('validates required secrets at startup', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, MAINDY_CREDENTIALS_KEY: 'short' } as NodeJS.ProcessEnv)).toThrow(/64 hex/);
  });
  it('defaults to offline AI and Opus 5.5 when no key/model is set', () => {
    const c = loadConfig(base as NodeJS.ProcessEnv);
    expect(c.anthropicApiKey).toBeUndefined();
    expect(c.models.primary.id).toBe('claude-opus-5-5');
    expect(c.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(c.google).toBeNull();
  });
  it('rejects unknown models instead of silently falling back', () => {
    expect(() => loadConfig({ ...base, MAINDY_MODEL: 'gpt-x' } as NodeJS.ProcessEnv)).toThrow(/Unknown model/);
  });
});

describe('security helpers', () => {
  it('encrypts provider credentials with AES-256-GCM and detects tampering', () => {
    const key = 'b'.repeat(64);
    const sealed = encryptSecret('{"refresh_token":"abc"}', key);
    expect(sealed.ciphertext).not.toContain('abc');
    expect(decryptSecret(sealed, key)).toBe('{"refresh_token":"abc"}');
    expect(() => decryptSecret({ ...sealed, ciphertext: Buffer.from('x').toString('base64') }, key)).toThrow();
  });
  it('redacts secrets from logs', () => {
    const r = redact('key sk-ant-api03-ABCDEFGHIJKLMNOP and token=supersecretvalue');
    expect(r).not.toContain('ABCDEFGHIJ');
    expect(r).not.toContain('supersecretvalue');
  });
  it('formats pgvector literals', () => {
    expect(toVectorLiteral([0.1, Number.NaN, -1])).toBe('[0.100000,0,-1.000000]');
  });
});
