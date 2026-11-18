import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { emailTokens } from "../db/schema.js";
import { randomToken, sha256Hex } from "../lib/crypto.js";

export type EmailTokenPurpose = "verify_email" | "reset_password";

export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

/** Issues a new single-use token and invalidates older unused ones of the same purpose. Returns the raw token. */
export async function issueEmailToken(db: DbOrTx, userId: string, purpose: EmailTokenPurpose): Promise<string> {
  await db
    .update(emailTokens)
    .set({ usedAt: sql`now()` })
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, purpose), isNull(emailTokens.usedAt)));
  const token = randomToken(32);
  await db.insert(emailTokens).values({
    userId,
    purpose,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/** Atomically consumes a token (single use). Returns the user id, or null when invalid/expired/used. */
export async function consumeEmailToken(db: DbOrTx, token: string, purpose: EmailTokenPurpose): Promise<string | null> {
  const rows = await db
    .update(emailTokens)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(emailTokens.tokenHash, sha256Hex(token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: emailTokens.userId });
  return rows[0]?.userId ?? null;
}
