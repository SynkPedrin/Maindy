import type { Metadata } from "next";
import { SettingsScreen } from "@/components/app/screens/settings";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return <SettingsScreen />;
}
