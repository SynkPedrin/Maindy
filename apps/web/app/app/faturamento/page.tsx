import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingScreen } from "@/components/app/screens/billing";

export const metadata: Metadata = { title: "Faturamento" };

export default function Page() {
  return (
    <Suspense>
      <BillingScreen />
    </Suspense>
  );
}
