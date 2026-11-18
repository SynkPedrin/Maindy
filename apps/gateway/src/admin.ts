/**
 * Admin endpoints used by the desktop app (all under /maindy/*, all require x-maindy-key — enforced by the
 * onRequest hook in server.ts). Contract: docs/ARCHITECTURE.md §5.
 *
 *   GET  /maindy/upstreams                         → { upstreams: UpstreamView[] }
 *   PUT  /maindy/upstreams/:id                     { baseUrl?, apiKey?: string|null } → UpstreamView
 *   POST /maindy/upstreams/:id/test                → { ok, latencyMs, models, error }
 *   GET  /maindy/integrations                      → { claudeCode, codex }
 *   POST /maindy/integrations/{claude-code|codex}/{install|uninstall}  { dryRun? } → InstallResult
 *
 * Secrets: apiKey lives only in ctx.credentials (memory). It is never written to gateway.json, never logged
 * and never part of telemetry. Installers only write user config when explicitly called, always with a
 * timestamped backup, preserving every other setting.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { request as undiciRequest } from "undici";
import { z } from "zod";
import { GatewayConfig, type UpstreamConfig } from "./config.js";
import type { GatewayContext } from "./context.js";
import { writePrivate } from "./home.js";
import { LOOPBACK, applyIntegration, classifyInstallerError, defaultCliCommand, integrationsView, type IntegrationEnv, type IntegrationTool } from "./integrations.js";
import { connectorForUpstream, credentialFor, joinUrl } from "./upstreams.js";

export interface AdminOptions {
  /** user home whose ~/.claude and ~/.codex are inspected/edited (tests pass a temp dir) */
  userHome?: string;
  /** PATH used to detect the `claude` / `codex` binaries (default process.env.PATH) */
  searchPath?: string;
  /** command that runs this gateway's CLI, e.g. `"/Applications/maindy.app/…/maindy-gateway"` */
  cliCommand?: string;
  /** actual listening port (known after listen) */
  port: () => number;
}

/* ------------------------------------------------------------------ */
/* Upstreams                                                           */
/* ------------------------------------------------------------------ */

export function upstreamView(ctx: GatewayContext, u: UpstreamConfig) {
  const c = credentialFor(u, ctx.credentials);
  return { id: u.id, kind: connectorForUpstream(u), baseUrl: u.baseUrl, hasCredential: c.key !== null, credentialSource: c.source };
}

/** http(s) only; plain http only to loopback; no userinfo (would leak secrets into gateway.json). */
export function validateBaseUrl(raw: string): { ok: true; url: string } | { ok: false; message: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, message: "baseUrl inválida." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, message: "Use http:// ou https://." };
  if (u.protocol === "http:" && !LOOPBACK.has(u.hostname)) {
    return { ok: false, message: "http:// só é aceito para endereços locais (127.0.0.1, localhost). Use https://." };
  }
  if (u.username || u.password) return { ok: false, message: "Não coloque usuário/senha na URL. Use o campo da chave de API." };
  if (u.search || u.hash) return { ok: false, message: "A baseUrl não pode ter query string nem fragmento." };
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}

const PutUpstream = z.object({
  baseUrl: z.string().min(1).max(500).optional(),
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .regex(/^[\x21-\x7e]+$/, "A chave não pode ter espaços ou caracteres especiais.")
    .nullable()
    .optional(),
});

function persistBaseUrl(ctx: GatewayContext, id: string, baseUrl: string): void {
  // patch the file itself (not the in-memory cfg, which may carry env overrides such as OLLAMA_BASE_URL)
  const raw = existsSync(ctx.paths.config) ? (JSON.parse(readFileSync(ctx.paths.config, "utf8")) as unknown) : ctx.cfg;
  const file = GatewayConfig.parse(raw);
  file.upstreams = file.upstreams.map((u) => (u.id === id ? { ...u, baseUrl } : u));
  writePrivate(ctx.paths.config, `${JSON.stringify(file, null, 2)}\n`);
}

const TEST_TIMEOUT_MS = 10_000;
const MAX_MODELS = 50;

export interface UpstreamTestResult {
  ok: boolean;
  latencyMs: number;
  models: string[];
  error: { code: string; message: string } | null;
}

/** GET {baseUrl}/v1/models with the configured credential. Costs no tokens. */
export async function testUpstream(ctx: GatewayContext, u: UpstreamConfig, timeoutMs = TEST_TIMEOUT_MS): Promise<UpstreamTestResult> {
  const { key } = credentialFor(u, ctx.credentials);
  const t0 = performance.now();
  const fail = (code: string, message: string): UpstreamTestResult => ({ ok: false, latencyMs: Math.round(performance.now() - t0), models: [], error: { code, message } });
  if (!key && (u.kind === "openai" || u.kind === "anthropic")) {
    return fail("missing_credential", "Nenhuma chave de API configurada para este provedor.");
  }
  const headers: Record<string, string> = { accept: "application/json", "accept-encoding": "identity" };
  if (u.kind === "anthropic") {
    if (key) headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (key) {
    headers.authorization = `Bearer ${key}`;
  }
  try {
    const res = await undiciRequest(joinUrl(u.baseUrl, "/v1/models"), {
      method: "GET",
      headers,
      dispatcher: ctx.dispatcher,
      signal: AbortSignal.timeout(timeoutMs),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    const text = await res.body.text();
    if (res.statusCode === 401 || res.statusCode === 403) return fail("unauthorized", "O provedor recusou a chave de API (401/403). Confira a chave.");
    if (res.statusCode === 404) return fail("not_found", "O endpoint /v1/models não existe nesta baseUrl. Confira o endereço.");
    if (res.statusCode === 429) return fail("rate_limited", "O provedor limitou as requisições (429). Tente de novo em instantes.");
    if (res.statusCode >= 400) return fail("upstream_error", `O provedor respondeu com erro HTTP ${res.statusCode}.`);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail("invalid_response", "A resposta do provedor não é JSON. A baseUrl aponta para uma API compatível?");
    }
    const list = (json as { data?: unknown; models?: unknown }).data ?? (json as { models?: unknown }).models;
    if (!Array.isArray(list)) return fail("invalid_response", "A resposta do provedor não tem a lista de modelos esperada.");
    const models = list
      .map((m) => (typeof m === "object" && m !== null ? ((m as { id?: unknown; name?: unknown }).id ?? (m as { name?: unknown }).name) : m))
      .filter((m): m is string => typeof m === "string")
      .slice(0, MAX_MODELS);
    return { ok: true, latencyMs: Math.round(performance.now() - t0), models, error: null };
  } catch (err) {
    const name = (err as Error)?.name ?? "";
    const code = (err as { code?: string })?.code ?? "";
    if (name === "TimeoutError" || name === "AbortError" || /TIMEOUT/i.test(code)) {
      return fail("timeout", `O provedor não respondeu em ${Math.round(timeoutMs / 1000)} s.`);
    }
    return fail("unreachable", "Não foi possível conectar ao provedor. Confira a baseUrl e a sua conexão.");
  }
}

/* ------------------------------------------------------------------ */
/* Integrations (Claude Code, Codex) — logic in integrations.ts        */
/* ------------------------------------------------------------------ */

export { defaultCliCommand, isSeaBinary } from "./integrations.js";

export const LAST_EVENT_KV = { claude_code: "integration_last_event:claude_code", codex: "integration_last_event:codex" } as const;

type Body = { dryRun?: unknown; forceStatusline?: unknown } | null | undefined;

export function registerAdminRoutes(app: FastifyInstance, ctx: GatewayContext, opts: AdminOptions, jsonBody: (req: FastifyRequest) => unknown): void {
  const bad = (reply: FastifyReply, status: number, code: string, message: string) => reply.code(status).send({ error: { code, message } });
  const env = (): IntegrationEnv => ({
    userHome: opts.userHome ?? homedir(),
    maindyHome: ctx.paths.dir,
    port: opts.port(),
    searchPath: opts.searchPath ?? process.env.PATH ?? "",
    // the CLI subcommands written to settings.json must talk to THIS gateway's home (key + runtime port)
    cliCommand: opts.cliCommand ?? defaultCliCommand(),
    lastEvent: (kind) => ctx.db.getKv<string>(LAST_EVENT_KV[kind]),
  });

  /* ---------- upstreams ---------- */
  app.get("/maindy/upstreams", async () => ({ upstreams: ctx.cfg.upstreams.map((u) => upstreamView(ctx, u)) }));

  app.put("/maindy/upstreams/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const u = ctx.cfg.upstreams.find((x) => x.id === id);
    if (!u) return bad(reply, 404, "unknown_upstream", `Upstream "${id}" não configurado.`);
    const parsed = PutUpstream.safeParse(jsonBody(req));
    if (!parsed.success) return bad(reply, 400, "invalid_body", parsed.error.issues[0]?.message ?? "Corpo inválido.");
    const { baseUrl, apiKey } = parsed.data;
    if (baseUrl !== undefined) {
      const v = validateBaseUrl(baseUrl);
      if (!v.ok) return bad(reply, 400, "invalid_base_url", v.message);
      try {
        persistBaseUrl(ctx, id, v.url);
      } catch {
        return bad(reply, 500, "config_write_failed", "Não foi possível gravar gateway.json.");
      }
      u.baseUrl = v.url;
    }
    if (apiKey !== undefined) ctx.credentials.set(id, apiKey);
    // metadata only — never the key
    ctx.log.info("upstream atualizado", { detail: `${id} baseUrl=${baseUrl !== undefined} apiKey=${apiKey === undefined ? "unchanged" : apiKey === null ? "cleared" : "set"}` });
    return upstreamView(ctx, u);
  });

  app.post("/maindy/upstreams/:id/test", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const u = ctx.cfg.upstreams.find((x) => x.id === id);
    if (!u) return bad(reply, 404, "unknown_upstream", `Upstream "${id}" não configurado.`);
    const r = await testUpstream(ctx, u);
    ctx.log.info("teste de upstream", { detail: `${id} ok=${r.ok} code=${r.error?.code ?? "-"}`, ms: r.latencyMs });
    return r;
  });

  /* ---------- integrations ---------- */
  app.get("/maindy/integrations", async () => integrationsView(env()));

  const flags = (req: FastifyRequest) => {
    const b = jsonBody(req) as Body;
    return { dryRun: b?.dryRun === true, forceStatusline: b?.forceStatusline === true };
  };

  for (const tool of ["claude-code", "codex"] as const satisfies readonly IntegrationTool[]) {
    app.post(`/maindy/integrations/${tool}/:action`, async (req, reply) => {
      const action = (req.params as { action: string }).action;
      if (action !== "install" && action !== "uninstall") return bad(reply, 404, "not_found", "Use install ou uninstall.");
      const { dryRun, forceStatusline } = flags(req);
      try {
        const r = applyIntegration(env(), tool, action, { dryRun, forceStatusline: tool === "claude-code" && forceStatusline });
        ctx.log.info(`${tool === "codex" ? "codex" : "claude code"} ${action}`, { detail: `changed=${r.changed.length > 0} dryRun=${dryRun}` });
        return {
          ok: true,
          changed: r.changed,
          messages: r.messages,
          backupPath: r.backupPath,
          ...(dryRun ? { preview: r.preview ?? "" } : {}),
        };
      } catch (err) {
        const f = classifyInstallerError(err, tool);
        ctx.log.warn("instalador não alterou a configuração", { detail: f.code, code: (err as { code?: string })?.code });
        return reply.code(f.status).send({ ok: false, changed: [], backupPath: null, error: { code: f.code, message: f.message } });
      }
    });
  }
}
