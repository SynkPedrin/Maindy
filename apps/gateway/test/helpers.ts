import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OrbitPolicyDto } from "@maindy/contracts";
import { defaultPolicy } from "@maindy/orbit-engine";
import { buildGateway, type BuildOptions, type Gateway } from "../src/server.js";
import { defaultConfig, type GatewayConfig } from "../src/config.js";

export interface Recorded {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

export interface MockServer {
  url: string;
  calls: Recorded[];
  close(): Promise<void>;
}

export async function mockServer(handler: (req: Recorded, res: ServerResponse) => void | Promise<void>): Promise<MockServer> {
  const calls: Recorded[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const rec = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
      calls.push(rec);
      void handler(rec, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

export function tempHome(prefix = "maindy-gw-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writePolicy(home: string, p: Partial<OrbitPolicyDto>): void {
  writeFileSync(join(home, "policy.json"), JSON.stringify({ ...defaultPolicy("balanced"), qualitySampleRate: 0, maxAddedLatencyMs: 2000, ...p }), { mode: 0o600 });
}

export async function startGateway(
  home: string,
  upstreams: { openai?: string; anthropic?: string; ollama?: string },
  patch?: (c: GatewayConfig) => GatewayConfig,
  build: Partial<BuildOptions> = {},
): Promise<Gateway & { url: string }> {
  const base = defaultConfig();
  base.port = 0;
  base.upstreams = base.upstreams.map((u) => {
    const url = (upstreams as Record<string, string | undefined>)[u.id];
    return url ? { ...u, baseUrl: url } : u;
  });
  const cfg = patch ? patch(base) : base;
  writeFileSync(join(home, "gateway.json"), JSON.stringify(cfg), { mode: 0o600 });
  const gw = buildGateway({ home, quiet: true, timers: false, port: 0, ...build });
  const { url } = await gw.listen();
  return Object.assign(gw, { url });
}

export function sse(events: unknown[], done = true): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + (done ? "data: [DONE]\n\n" : "");
}

export async function waitFor<T>(fn: () => T | undefined | null | false, ms = 3000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}
