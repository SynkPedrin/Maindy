// Fake `codex app-server` for tests: JSONL JSON-RPC over stdio.
import { createInterface } from "node:readline";
const mode = process.argv[2] ?? "ok";
const rl = createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    if (mode === "init-error") return send({ id: msg.id, error: { code: -1, message: "nope" } });
    send({ id: msg.id, result: { userAgent: "fake" } });
  } else if (msg.method === "account/rateLimits/read") {
    if (mode === "hang") return;
    send({ method: "thread/started", params: {} });
    send({
      id: msg.id,
      result: {
        rateLimits: {
          primary: { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1790000000 },
          secondary: { usedPercent: 7, windowDurationMins: 10080, resetsAt: null },
        },
      },
    });
  }
});
