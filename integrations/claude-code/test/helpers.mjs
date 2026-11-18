import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

export function tempDir(prefix = "maindy-cc-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Start a mock gateway. handler(req, bodyText) → { status, json, delayMs } */
export async function mockGateway(handler) {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      calls.push({ method: req.method, url: req.url, headers: req.headers, body });
      const r = (await handler(req, body)) ?? { status: 404, json: {} };
      const send = () => {
        if (res.destroyed) return;
        res.writeHead(r.status ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify(r.json ?? {}));
      };
      if (r.delayMs) setTimeout(send, r.delayMs);
      else send();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

export function stdinOf(text) {
  return Readable.from([Buffer.from(text)]);
}
