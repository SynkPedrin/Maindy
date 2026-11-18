/**
 * Upstream selection + header forwarding.
 *
 * Selection: `x-maindy-upstream` header → model rules (gateway.json) → route default
 * (/v1/messages → first anthropic upstream; OpenAI routes → defaultUpstream).
 *
 * Credentials: the client's own Authorization / x-api-key are forwarded verbatim in transit and never
 * stored or logged. Only when the client sent none do we inject a BYOK key: first one set at runtime by
 * the desktop app (PUT /maindy/upstreams/:id — kept ONLY in this process's memory, never on disk, logs or
 * telemetry), else the env var named in gateway.json (`apiKeyEnv`).
 */
import type { ConnectorKind } from "@maindy/contracts";
import type { WireFormat } from "@maindy/provider-adapters";
import type { GatewayConfig, UpstreamConfig } from "./config.js";

export class UpstreamError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function connectorForUpstream(u: UpstreamConfig): ConnectorKind {
  if (u.kind === "openai") return "openai_api";
  if (u.kind === "anthropic") return "anthropic_api";
  return "openai_compatible";
}

export function providerName(u: UpstreamConfig): string {
  return u.provider ?? (u.kind === "openai_compatible" ? u.id : u.kind);
}

export function selectUpstream(cfg: GatewayConfig, format: WireFormat | null, model: string | null, headerValue: string | undefined): UpstreamConfig {
  const byId = (id: string) => cfg.upstreams.find((u) => u.id === id);
  if (headerValue) {
    const u = byId(headerValue.trim());
    if (!u) throw new UpstreamError(400, "unknown_upstream", `Upstream "${headerValue}" não configurado em gateway.json.`);
    return u;
  }
  if (model) {
    for (const r of cfg.modelRules) {
      const hit = r.match === "prefix" ? model.startsWith(r.value) : safeRegex(r.value)?.test(model);
      if (hit) {
        const u = byId(r.upstream);
        // a rule pointing to an upstream that cannot speak this wire format is skipped
        if (u && compatible(u, format)) return u;
      }
    }
  }
  if (format === "anthropic_messages") {
    const a = cfg.upstreams.find((u) => u.kind === "anthropic");
    if (a) return a;
  }
  const d = byId(cfg.defaultUpstream) ?? cfg.upstreams[0];
  if (!d) throw new UpstreamError(500, "no_upstream", "Nenhum upstream configurado.");
  return d;
}

function compatible(u: UpstreamConfig, format: WireFormat | null): boolean {
  if (format === "anthropic_messages") return u.kind === "anthropic";
  return true;
}

const regexCache = new Map<string, RegExp | null>();
function safeRegex(src: string): RegExp | null {
  if (!regexCache.has(src)) {
    try {
      regexCache.set(src, new RegExp(src));
    } catch {
      regexCache.set(src, null);
    }
  }
  return regexCache.get(src)!;
}

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
  "expect",
]);

/** BYOK keys set at runtime. Memory only: the map is never serialized, logged or sent anywhere. */
export class CredentialStore {
  readonly #keys = new Map<string, string>();
  get(id: string): string | undefined {
    return this.#keys.get(id);
  }
  set(id: string, key: string | null): void {
    if (key === null) this.#keys.delete(id);
    else this.#keys.set(id, key);
  }
  /** never expose the values through JSON.stringify / inspection */
  toJSON(): Record<string, string> {
    return {};
  }
}

export type CredentialSource = "memory" | "env" | "none";

export function credentialFor(u: UpstreamConfig, store?: CredentialStore): { key: string | null; source: CredentialSource } {
  const mem = store?.get(u.id);
  if (mem) return { key: mem, source: "memory" };
  const env = u.apiKeyEnv ? process.env[u.apiKeyEnv] : undefined;
  if (env) return { key: env, source: "env" };
  return { key: null, source: "none" };
}

export function hasCredential(u: UpstreamConfig, store?: CredentialStore): boolean {
  return credentialFor(u, store).key !== null;
}

/** Build upstream request headers from the client's headers (verbatim, minus hop-by-hop and x-maindy-*). */
export function upstreamHeaders(
  u: UpstreamConfig,
  clientHeaders: Record<string, string | string[] | undefined>,
  bodyLength: number,
  store?: CredentialStore,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(clientHeaders)) {
    const key = k.toLowerCase();
    if (v === undefined || HOP_BY_HOP.has(key) || key.startsWith("x-maindy-")) continue;
    out[key] = Array.isArray(v) ? v.join(", ") : v;
  }
  out["accept-encoding"] = "identity";
  out["content-length"] = String(bodyLength);
  if (!out["content-type"]) out["content-type"] = "application/json";
  const envKey = credentialFor(u, store).key ?? undefined;
  if (u.kind === "anthropic") {
    if (!out["x-api-key"] && !out.authorization && envKey) out["x-api-key"] = envKey;
    if (!out["anthropic-version"]) out["anthropic-version"] = "2023-06-01";
  } else if (!out.authorization && envKey) {
    out.authorization = `Bearer ${envKey}`;
  }
  return out;
}

/** Response headers we must not copy back to the client. */
export const RESPONSE_SKIP = new Set(["connection", "keep-alive", "transfer-encoding", "content-length"]);

export function joinUrl(base: string, pathAndQuery: string): string {
  const b = base.replace(/\/+$/, "");
  // allow base URLs that already include /v1 (e.g. "https://openrouter.ai/api/v1")
  if (b.endsWith("/v1") && pathAndQuery.startsWith("/v1/")) return b + pathAndQuery.slice(3);
  return b + pathAndQuery;
}
