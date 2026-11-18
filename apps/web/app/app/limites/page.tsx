import type { Metadata } from "next";
import { LimitsScreen } from "@/components/app/screens/limits";

export const metadata: Metadata = { title: "Limites & Sessões" };

export default function Page() {
  return <LimitsScreen />;
}
