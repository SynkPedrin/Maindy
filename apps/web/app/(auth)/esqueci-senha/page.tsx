import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/app/auth/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <ForgotPasswordForm initialEmail={typeof sp.email === "string" ? sp.email : ""} />;
}
