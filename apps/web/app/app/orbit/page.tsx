import type { Metadata } from "next";
import { OrbitScreen } from "@/components/app/screens/orbit";

export const metadata: Metadata = { title: "ORBIT Engine" };

export default function Page() {
  return <OrbitScreen />;
}
