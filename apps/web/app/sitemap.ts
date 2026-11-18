import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; priority: number; freq: "weekly" | "monthly" | "yearly" }[] = [
    { path: "/", priority: 1, freq: "weekly" },
    { path: "/metodologia", priority: 0.9, freq: "monthly" },
    { path: "/precos", priority: 0.9, freq: "weekly" },
    { path: "/ajuda", priority: 0.6, freq: "monthly" },
    { path: "/privacidade", priority: 0.3, freq: "yearly" },
    { path: "/termos", priority: 0.3, freq: "yearly" },
    { path: "/cadastro", priority: 0.5, freq: "yearly" },
    { path: "/login", priority: 0.3, freq: "yearly" },
  ];
  return pages.map((p) => ({ url: `${site}${p.path}`, lastModified: now, changeFrequency: p.freq, priority: p.priority }));
}
