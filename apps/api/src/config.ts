import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Absolute path of apps/api (works from src/ and from dist/). */
export const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    API_HOST: z.string().default("127.0.0.1"),
    API_PUBLIC_URL: z.string().url().default("http://localhost:4100"),
    WEB_PUBLIC_URL: z.string().url().default("http://localhost:3100"),
    DATABASE_URL: z.string().url().default("postgres://maindy:maindy_dev@127.0.0.1:5433/maindy"),
    TEST_DATABASE_URL: z.string().url().default("postgres://maindy:maindy_dev@127.0.0.1:5433/maindy_test"),
    SESSION_SECRET: optionalString,
    SMTP_URL: z.string().default("smtp://127.0.0.1:1025"),
    MAIL_FROM: z.string().default("maindy. <nao-responda@maindy.local>"),
    BILLING_PROVIDER: z.enum(["sandbox", "stripe"]).default("sandbox"),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    RELEASES_BASE_URL: z.string().url().default("http://localhost:4100/releases"),
    RELEASES_DIR: z.string().default(".data/releases"),
    /** fastify trustProxy: "loopback" (default — trusts X-Forwarded-For only from the local Next.js rewrite), "true", "false" or CIDR list */
    TRUST_PROXY: z.string().default("loopback"),
    /** authoritative client-IP header set by the production edge (e.g. "x-vercel-forwarded-for", "cf-connecting-ip", "x-real-ip"). Recommended in production. */
    CLIENT_IP_HEADER: z.string().regex(/^[A-Za-z0-9-]+$/).optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
        ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "SESSION_SECRET (>= 32 chars) is required in production" });
      }
      if (env.BILLING_PROVIDER === "sandbox") {
        ctx.addIssue({ code: "custom", path: ["BILLING_PROVIDER"], message: "sandbox billing is not allowed in production" });
      }
    }
    if (env.BILLING_PROVIDER === "stripe" && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message: "BILLING_PROVIDER=stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export interface Config extends Omit<Env, "SESSION_SECRET" | "TRUST_PROXY"> {
  SESSION_SECRET: string;
  /** true when SESSION_SECRET was generated at runtime (dev/test only) */
  sessionSecretEphemeral: boolean;
  TRUST_PROXY: boolean | string | string[];
  releasesDirAbs: string;
  webOrigin: string;
  isProd: boolean;
}

/** Loads apps/api/.env (optional, git-ignored) then .env.development (non-prod). Existing env vars always win. */
export function loadEnvFiles(): void {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const files = [resolve(API_ROOT, ".env")];
  if (nodeEnv !== "production") files.push(resolve(API_ROOT, ".env.development"));
  for (const f of files) {
    if (existsSync(f)) process.loadEnvFile(f);
  }
}

function parseTrustProxy(v: string): boolean | string | string[] {
  if (v === "true") return true;
  if (v === "false") return false;
  return v.includes(",") ? v.split(",").map((s) => s.trim()) : v;
}

export function buildConfig(raw: Record<string, string | undefined> = process.env, overrides: Partial<Env> = {}): Config {
  const parsed = EnvSchema.safeParse({ ...raw, ...overrides });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${msg}`);
  }
  const env = parsed.data;
  const sessionSecretEphemeral = !env.SESSION_SECRET;
  return {
    ...env,
    SESSION_SECRET: env.SESSION_SECRET ?? randomBytes(32).toString("hex"),
    sessionSecretEphemeral,
    TRUST_PROXY: parseTrustProxy(env.TRUST_PROXY),
    releasesDirAbs: isAbsolute(env.RELEASES_DIR) ? env.RELEASES_DIR : resolve(API_ROOT, env.RELEASES_DIR),
    webOrigin: new URL(env.WEB_PUBLIC_URL).origin,
    isProd: env.NODE_ENV === "production",
  };
}
