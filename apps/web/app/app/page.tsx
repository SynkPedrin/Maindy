import { redirect } from "next/navigation";
import { OnboardingStep } from "@maindy/contracts";
import { getServerMe } from "@/lib/api/server";

export default async function AppIndex() {
  const r = await getServerMe();
  if (r.kind !== "ok") redirect("/login?motivo=sessao&next=%2Fapp");
  const { completed, dismissed } = r.me.onboarding;
  const incomplete = OnboardingStep.options.some((s) => !completed.includes(s));
  redirect(incomplete && !dismissed ? "/app/onboarding" : "/app/overview");
}
