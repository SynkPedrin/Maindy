import type { Metadata } from "next";
import { PlanCode } from "@maindy/contracts";
import { SignupForm } from "@/components/app/auth/signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function CadastroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = typeof sp.plano === "string" ? sp.plano : undefined;
  const plan = PlanCode.safeParse(raw);
  return <SignupForm planCode={plan.success ? plan.data : undefined} />;
}
