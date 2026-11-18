import { Suspense } from "react";
import type { Metadata } from "next";
import { ReportsScreen } from "@/components/app/screens/reports";

export const metadata: Metadata = { title: "Relatórios" };

export default function Page() {
  return (
    <Suspense>
      <ReportsScreen />
    </Suspense>
  );
}
