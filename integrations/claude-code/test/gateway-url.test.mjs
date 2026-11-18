import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gatewayUrl } from "../src/gateway.mjs";
import { tempDir } from "./helpers.mjs";

describe("gatewayUrl", () => {
  it("prefers the port of the running gateway (runtime.json), then gateway.json, then 8787", () => {
    const home = tempDir();
    const env = { MAINDY_HOME: home };
    expect(gatewayUrl(env)).toBe("http://127.0.0.1:8787");
    writeFileSync(join(home, "gateway.json"), JSON.stringify({ port: 8790 }));
    expect(gatewayUrl(env)).toBe("http://127.0.0.1:8790");
    // stale runtime file (dead pid) is ignored
    writeFileSync(join(home, "runtime.json"), JSON.stringify({ pid: 2 ** 22 + 12345, port: 40001 }));
    expect(gatewayUrl(env)).toBe("http://127.0.0.1:8790");
    writeFileSync(join(home, "runtime.json"), JSON.stringify({ pid: process.pid, port: 40001 }));
    expect(gatewayUrl(env)).toBe("http://127.0.0.1:40001");
    expect(gatewayUrl({ ...env, MAINDY_GATEWAY_URL: "http://127.0.0.1:9/" })).toBe("http://127.0.0.1:9");
  });
});
