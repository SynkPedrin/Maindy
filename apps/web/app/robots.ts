import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app/", "/api/", "/verificar-email", "/esqueci-senha"] }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
