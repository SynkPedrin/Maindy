import { isIPv4, isIPv6 } from "node:net";

function expandIPv6(addr: string): string[] {
  const zone = addr.indexOf("%");
  const a = zone >= 0 ? addr.slice(0, zone) : addr;
  const [head, tail] = a.includes("::") ? a.split("::") : [a, undefined];
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const fill = tail !== undefined ? new Array(Math.max(0, 8 - h.length - t.length)).fill("0") : [];
  return [...h, ...fill, ...t].map((g) => (g === "" ? "0" : g.toLowerCase()));
}

/**
 * Truncates an IP to a coarse prefix for display/audit (privacy):
 * IPv4 → /24 ("203.0.113.0/24"), IPv6 → /48 ("2001:db8:1::/48"). IPv4-mapped IPv6 is unwrapped.
 */
export function ipPrefix(ip: string | undefined | null): string | null {
  if (!ip) return null;
  let addr = ip.trim();
  if (addr.toLowerCase().startsWith("::ffff:") && isIPv4(addr.slice(7))) addr = addr.slice(7);
  if (isIPv4(addr)) {
    const p = addr.split(".");
    return `${p[0]}.${p[1]}.${p[2]}.0/24`;
  }
  if (isIPv6(addr)) {
    const g = expandIPv6(addr).slice(0, 3).map((x) => x.replace(/^0+(?=.)/, ""));
    return `${g.join(":")}::/48`;
  }
  return null;
}

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

/** Whether the TCP peer counts as a trusted proxy hop under the configured TRUST_PROXY value. */
export function isTrustedPeer(peer: string, trust: boolean | string | string[]): boolean {
  if (trust === true) return true;
  if (trust === false) return false;
  const list = Array.isArray(trust) ? trust : [trust];
  return list.some((t) => {
    if (t === "loopback") return LOOPBACK.test(peer);
    if (t === "uniquelocal" || t === "linklocal") return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|fc|fd|fe80)/i.test(peer);
    if (!t.includes("/")) return peer === t || peer === `::ffff:${t}`;
    const [base, bitsStr] = t.split("/");
    const bits = Number(bitsStr);
    const v4 = (ip: string) => ip.replace(/^::ffff:/, "").split(".").map(Number);
    const a = v4(peer), b = v4(base!);
    if (a.length !== 4 || b.length !== 4 || a.some(Number.isNaN)) return false;
    const n = (x: number[]) => ((x[0]! << 24) >>> 0) + (x[1]! << 16) + (x[2]! << 8) + x[3]!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n(a) & mask) === (n(b) & mask);
  });
}
