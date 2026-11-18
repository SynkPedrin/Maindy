import type { Metadata } from "next";
import { ConnectionsScreen } from "@/components/app/screens/connections";

export const metadata: Metadata = { title: "Integrações" };

export default function Page() {
  return <ConnectionsScreen />;
}
