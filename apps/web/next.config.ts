import type { NextConfig } from "next";

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4100";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  // Optional separate build dir so a second dev server (e.g. :3102 for app QA) can run beside the default one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@maindy/contracts", "@maindy/design-system"],
  // Same-origin proxy so the session cookie stays first-party (httpOnly, SameSite=Lax).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
