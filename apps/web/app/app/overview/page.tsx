import { Suspense } from "react";
import type { Metadata } from "next";
import { OverviewScreen } from "@/components/app/screens/overview";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return (
    <Suspense>
      <OverviewScreen />
    </Suspense>
  );
}
