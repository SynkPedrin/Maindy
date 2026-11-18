import type { Role } from "@maindy/contracts";
import type { BillingProvider } from "./billing/provider.js";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { RateLimiter } from "./lib/rate-limiter.js";
import type { Mailer } from "./mail/mailer.js";

export interface AppDeps {
  config: Config;
  db: Db;
  /** db ping for /health */
  ping: () => Promise<void>;
  mailer: Mailer;
  billing: BillingProvider;
  limiter: RateLimiter;
}

export type AuthMode = "none" | "web" | "device" | "any";

export interface WebAuth {
  kind: "web";
  userId: string;
  orgId: string;
  role: Role;
  sessionId: string;
}

export interface DeviceAuth {
  kind: "device";
  deviceId: string;
  orgId: string;
  /** user that approved the pairing (MeDto for devices is rendered for this user) */
  approvedByUserId: string | null;
}

export type AuthContext = WebAuth | DeviceAuth;

declare module "fastify" {
  interface FastifyInstance {
    deps: AppDeps;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    /** who may call this route; default "none" (public) */
    auth?: AuthMode;
    /** web roles allowed (device auth bypasses role checks only where auth is "device"/"any") */
    roles?: Role[];
  }
}
