import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url — used for session, device, email and device-code tokens. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export const sha256Hex = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

export const hmacHex = (secret: string, value: string): string => createHmac("sha256", secret).update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Device-flow user code alphabet: no 0/O, 1/I/L, U (ambiguous or profane-prone). */
export const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export function generateUserCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Normalizes user input ("kq7m 2xwd", "KQ7M2XWD") to "KQ7M-2XWD"; null if malformed. */
export function normalizeUserCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 8) return null;
  for (const ch of raw) if (!USER_CODE_ALPHABET.includes(ch)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
