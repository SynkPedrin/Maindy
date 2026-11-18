import type { Metadata } from "next";
import { VerifyEmail } from "@/components/app/auth/verify-email";

export const metadata: Metadata = { title: "Verificar e-mail" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <VerifyEmail token={typeof sp.token === "string" ? sp.token : null} />;
}
