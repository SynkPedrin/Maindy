import { describe, expect, it } from "vitest";
import { buildConfig } from "../src/config.js";
import { generateUserCode } from "../src/lib/crypto.js";
import { ipPrefix } from "../src/lib/ip.js";
import { RateLimiter } from "../src/lib/rate-limiter.js";
import { computeSummary, EMPTY_AGGREGATE, weakestSource } from "../src/savings/math.js";

describe("savings math (pure)", () => {
  it("multiplier null when baseline is 0 or denominator is 0", () => {
    const q = { evaluations: 0, passed: 0, rollbacks: 0 };
    const p = { from: new Date(0), to: new Date(1000), currency: "USD" };
    expect(computeSummary({ ...EMPTY_AGGREGATE, requests: 2, costMicros: 10 }, q, p).efficiencyMultiplier).toBeNull();
    // all cache hits with no overhead: infinite → null (never render ∞)
    const allHits = computeSummary({ ...EMPTY_AGGREGATE, requests: 1, requestsWithBaseline: 1, baselineMicros: 500 }, q, p);
    expect(allHits.efficiencyMultiplier).toBeNull();
    expect(allHits.netSavings.micros).toBe(500);
  });

  it("weakest source ignores unavailable unless it is the only one", () => {
    expect(weakestSource(["provider_reported", "locally_measured"])).toBe("locally_measured");
    expect(weakestSource(["provider_reported", "unavailable"])).toBe("provider_reported");
    expect(weakestSource(["unavailable"])).toBe("unavailable");
    expect(weakestSource([])).toBe("unavailable");
  });
});

describe("helpers", () => {
  it("truncates IPs to coarse prefixes", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0.113.0/24");
    expect(ipPrefix("::ffff:198.51.100.9")).toBe("198.51.100.0/24");
    expect(ipPrefix("2001:db8:abcd:12::1")).toBe("2001:db8:abcd::/48");
    expect(ipPrefix("::1")).toBe("0:0:0::/48");
    expect(ipPrefix("garbage")).toBeNull();
  });

  it("user codes are XXXX-XXXX without ambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(generateUserCode()).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
  });

  it("rate limiter windows reset", () => {
    let now = 0;
    const l = new RateLimiter(() => now);
    l.hit("k", 2, 1000);
    l.hit("k", 2, 1000);
    expect(() => l.hit("k", 2, 1000)).toThrow(/Muitas tentativas/);
    now = 1001;
    expect(() => l.hit("k", 2, 1000)).not.toThrow();
  });

  it("config: production requires SESSION_SECRET and forbids sandbox billing; dev generates an ephemeral secret", () => {
    expect(() => buildConfig({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
    expect(() => buildConfig({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40) })).toThrow(/sandbox/);
    expect(() => buildConfig({ BILLING_PROVIDER: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
    const dev = buildConfig({ NODE_ENV: "development" });
    expect(dev.sessionSecretEphemeral).toBe(true);
    expect(dev.SESSION_SECRET).toHaveLength(64);
    expect(dev.webOrigin).toBe("http://localhost:3100");
  });
});
