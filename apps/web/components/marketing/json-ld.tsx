export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Escape "<" to avoid breaking out of the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

/** Organization + SoftwareApplication. Prices are provisional, so offers are intentionally omitted. */
export function orgAndAppSchema() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "maindy.",
      url: siteUrl,
      logo: `${siteUrl}/brand/orb-640.png`,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "maindy.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows",
      description:
        "Camada de eficiência para reduzir desperdícios de IA em APIs, agentes e ferramentas de desenvolvimento. Powered by ORBIT Engine™.",
      url: siteUrl,
      inLanguage: "pt-BR",
    },
  ];
}
