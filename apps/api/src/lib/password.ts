import { hash, verify, type Algorithm } from "@node-rs/argon2";

/** argon2id (OWASP 2025 baseline: m=19 MiB, t=2, p=1). */
const OPTIONS = { algorithm: 2 as Algorithm /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string): Promise<string> => hash(password, OPTIONS);

let dummyHash: Promise<string> | null = null;

/** Verifies a password; with `storedHash` null it still burns a verification to equalize timing. */
export async function verifyPassword(storedHash: string | null, password: string): Promise<boolean> {
  if (!storedHash) {
    dummyHash ??= hash("maindy-dummy-password-for-timing", OPTIONS);
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
