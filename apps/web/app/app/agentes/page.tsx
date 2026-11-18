import type { Metadata } from "next";
import { AgentsScreen } from "@/components/app/screens/agents";

export const metadata: Metadata = { title: "Agentes & Projetos" };

export default function Page() {
  return <AgentsScreen />;
}
