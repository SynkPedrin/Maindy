import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Prompt-injection hygiene: anything retrieved from memories, vault notes, e-mails or
 * other integrations is DATA. It is wrapped in clearly delimited, escaped blocks and the
 * system prompt tells the model to never follow instructions found inside them.
 */
export function escapeForPrompt(text: string): string {
  return text.replace(/</g, '‹').replace(/>/g, '›');
}

export function wrapUntrusted(tag: 'memory' | 'note' | 'email' | 'event' | 'task' | 'reminder', attrs: Record<string, string | number | null | undefined>, body: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${escapeForPrompt(String(v)).replace(/"/g, "'")}"`)
    .join(' ');
  return `<${tag}${a ? ` ${a}` : ''}>\n${escapeForPrompt(body)}\n</${tag}>`;
}

const INJECTION_PATTERNS = [
  /ignore (all |the )?(previous|prior|above) instructions/i,
  /ignore (as|todas as) instru[cç][oõ]es/i,
  /desconsidere (as|todas as) instru[cç][oõ]es/i,
  /\bsystem prompt\b/i,
  /you are now/i,
  /voc[eê] agora [eé]/i,
  /envie (todas as|as) (minhas )?(mem[oó]rias|senhas)/i,
  /send (all|every) (memories|passwords|data)/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/** AES-256-GCM for provider credentials (OAuth tokens). Key: 32 bytes hex (MAINDY_CREDENTIALS_KEY). */
export function encryptSecret(plaintext: string, keyHex: string): { ciphertext: string; iv: string; authTag: string } {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) throw new Error('MAINDY_CREDENTIALS_KEY must be 32 bytes (64 hex chars)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

export function decryptSecret(sealed: { ciphertext: string; iv: string; authTag: string }, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

/** Removes anything that looks like a credential before logging/reporting. */
export function redact(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, 'sk-ant-[redacted]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt-redacted]')
    .replace(/(api[_-]?key|token|secret|password)(["':=\s]+)[^\s"',]{6,}/gi, '$1$2[redacted]');
}
