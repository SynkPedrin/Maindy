import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: "maindy. — Sua IA trabalha mais. Você gasta menos.", template: "%s · maindy." },
  description:
    "Uma camada inteligente para reduzir desperdícios de IA em APIs, agentes e ferramentas de desenvolvimento. Powered by ORBIT Engine™.",
  applicationName: "maindy.",
  openGraph: { type: "website", locale: "pt_BR", siteName: "maindy." },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#080623", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" translate="no" data-theme="dark" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <meta name="google" content="notranslate" />
        {/* Dashboard theme (light/dark) restored before paint; only inside /app — the site stays dark. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(location.pathname.indexOf("/app")===0){var t=localStorage.getItem("maindy-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}}catch(e){}` }} />
      </head>
      <body className="min-h-dvh bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}
