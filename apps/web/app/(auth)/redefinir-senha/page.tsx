import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/app/auth/reset-password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ResetPasswordForm token={typeof sp.token === "string" ? sp.token : null} />;
}
