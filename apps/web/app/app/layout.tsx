import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerMe } from "@/lib/api/server";
import { safeNextPath } from "@/lib/api/client";
import { AppProviders } from "@/components/app/providers";
import { AppShell } from "@/components/app/shell";
import { AppUnavailable } from "@/components/app/app-unavailable";
import "@/components/app/app.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Painel", template: "%s · maindy." }, robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getServerMe();
  if (result.kind === "unauthenticated") {
    const path = safeNextPath((await headers()).get("x-maindy-path"), "/app");
    redirect(`/login?motivo=sessao&next=${encodeURIComponent(path)}`);
  }
  return (
    <>
      {result.kind === "error" ? (
        <AppUnavailable message={result.message} />
      ) : (
        <AppProviders me={result.me}>
          <AppShell>{children}</AppShell>
        </AppProviders>
      )}
    </>
  );
}
