import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { ensurePrivate, writePrivate, type HomePaths } from "./home.js";

export const UpstreamKind = z.enum(["openai", "anthropic", "openai_compatible"]);
export type UpstreamKind = z.infer<typeof UpstreamKind>;

export const UpstreamConfig = z.object({
  id: z.string().min(1).max(40),
  kind: UpstreamKind,
  baseUrl: z.string().url(),
  /** env var holding a BYOK key (the key itself never goes in this file) */
  apiKeyEnv: z.string().optional(),
  /** provider label in telemetry ("openai", "anthropic", "ollama", "openrouter"…) */
  provider: z.string().max(60).optional(),
  /** runs on this machine → cost 0 (locally_measured) */
  local: z.boolean().default(false),
});
export type UpstreamConfig = z.infer<typeof UpstreamConfig>;

export const ModelRule = z.object({
  /** "prefix" (startsWith) or "regex" */
  match: z.enum(["prefix", "regex"]),
  value: z.string().min(1),
  upstream: z.string(),
});
export type ModelRule = z.infer<typeof ModelRule>;

export const GatewayConfig = z.object({
  port: z.number().int().min(0).max(65535).default(8787),
  /** tenant namespace for cache isolation in local mode (cloud org id is used when linked) */
  tenant: z.string().default("local"),
  defaultUpstream: z.string().default("openai"),
  upstreams: z.array(UpstreamConfig),
  modelRules: z.array(ModelRule).default([]),
  cache: z
    .object({ allowNonDeterministic: z.boolean().default(false), allowStreaming: z.boolean().default(true) })
    .default({ allowNonDeterministic: false, allowStreaming: true }),
  routing: z.array(z.object({ from: z.string(), to: z.string(), maxPromptTokens: z.number().int().optional(), noTools: z.boolean().optional() })).default([]),
  outputBudgetTokens: z.number().int().min(64).default(8192),
  cloud: z.object({ apiUrl: z.string().url().nullable().default(null) }).default({ apiUrl: null }),
  telemetry: z
    .object({ flushIntervalMs: z.number().int().min(200).default(5000), batchSize: z.number().int().min(1).max(500).default(100) })
    .default({ flushIntervalMs: 5000, batchSize: 100 }),
  /** compression thresholds for /maindy/compress (Claude Code PostToolUse hook) */
  hookCompression: z
    .object({ minTokensSaved: z.number().int().default(200), minRatio: z.number().default(0.15) })
    .default({ minTokensSaved: 200, minRatio: 0.15 }),
});
export type GatewayConfig = z.infer<typeof GatewayConfig>;

export function defaultConfig(): GatewayConfig {
  return GatewayConfig.parse({
    port: 8787,
    tenant: "local",
    defaultUpstream: "openai",
    upstreams: [
      { id: "openai", kind: "openai", baseUrl: "https://api.openai.com", apiKeyEnv: "OPENAI_API_KEY", provider: "openai" },
      { id: "anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKeyEnv: "ANTHROPIC_API_KEY", provider: "anthropic" },
      { id: "ollama", kind: "openai_compatible", baseUrl: "http://127.0.0.1:11434", provider: "ollama", local: true },
    ],
    modelRules: [
      { match: "prefix", value: "claude-", upstream: "anthropic" },
      // Ollama-style "name:tag" (fine-tuned OpenAI ids start with "ft:" and are excluded)
      { match: "regex", value: "^(?!ft:)[^/:]+:[^/:]+$", upstream: "ollama" },
      { match: "regex", value: "^(gpt-|o\\d|chatgpt-|codex-|text-embedding-|ft:)", upstream: "openai" },
      { match: "regex", value: "^(llama|qwen|mistral|mixtral|gemma|phi|deepseek|kairo|moondream|nomic|mxbai)", upstream: "ollama" },
    ],
  });
}

/** Load gateway.json (creating it with 0600 on first run) and apply env overrides. */
export function loadConfig(paths: HomePaths): GatewayConfig {
  let cfg: GatewayConfig;
  if (existsSync(paths.config)) {
    ensurePrivate(paths.config);
    cfg = GatewayConfig.parse(JSON.parse(readFileSync(paths.config, "utf8")));
  } else {
    cfg = defaultConfig();
    writePrivate(paths.config, `${JSON.stringify(cfg, null, 2)}\n`);
  }
  if (process.env.OLLAMA_BASE_URL) {
    cfg.upstreams = cfg.upstreams.map((u) => (u.id === "ollama" ? { ...u, baseUrl: process.env.OLLAMA_BASE_URL! } : u));
  }
  if (process.env.MAINDY_GATEWAY_PORT) cfg.port = Number(process.env.MAINDY_GATEWAY_PORT);
  if (process.env.GATEWAY_API_URL) cfg.cloud = { apiUrl: process.env.GATEWAY_API_URL };
  return cfg;
}
