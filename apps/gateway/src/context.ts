import type { Dispatcher } from "undici";
import { LoopGuard, PRICING_VERSION, RegressionDetector, RetryBudget } from "@maindy/orbit-engine";
import type { GatewayConfig } from "./config.js";
import type { GatewayDb } from "./db.js";
import type { DeviceFile, HomePaths } from "./home.js";
import type { Logger } from "./logger.js";
import type { PolicyManager } from "./policy.js";
import type { CloudLink, TelemetryFlusher } from "./telemetry.js";
import type { CredentialStore } from "./upstreams.js";

export interface GatewayContext {
  version: string;
  startedAt: number;
  cfg: GatewayConfig;
  paths: HomePaths;
  db: GatewayDb;
  log: Logger;
  key: string;
  policy: PolicyManager;
  flusher: TelemetryFlusher;
  link: () => CloudLink | null;
  device: () => DeviceFile | null;
  /** cache tenant namespace: cloud organization id when linked, else config tenant */
  tenant: () => string;
  loopGuard: LoopGuard;
  retryBudget: RetryBudget;
  regression: RegressionDetector;
  dispatcher: Dispatcher;
  pricingVersion: string;
  rng: () => number;
  /** runtime BYOK keys (memory only) */
  credentials: CredentialStore;
}

export function makeGuards() {
  return {
    loopGuard: new LoopGuard(60_000),
    retryBudget: new RetryBudget(),
    regression: new RegressionDetector(),
    pricingVersion: PRICING_VERSION,
  };
}
