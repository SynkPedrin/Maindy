import type { Metadata } from "next";
import { OnboardingScreen } from "@/components/app/screens/onboarding";

export const metadata: Metadata = { title: "Onboarding" };

export default function Page() {
  return <OnboardingScreen />;
}
