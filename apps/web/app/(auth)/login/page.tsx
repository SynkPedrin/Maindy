import type { Metadata } from "next";
import { LoginForm } from "@/components/app/auth/login-form";
import { safeNextPath } from "@/lib/api/client";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, "/app");
  const reason = typeof sp.motivo === "string" ? sp.motivo : undefined;
  const email = typeof sp.email === "string" ? sp.email : "";
  return <LoginForm next={next} reason={reason} initialEmail={email} />;
}
