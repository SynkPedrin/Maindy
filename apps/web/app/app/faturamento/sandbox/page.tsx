import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingSandboxScreen } from "@/components/app/screens/billing-sandbox";

export const metadata: Metadata = { title: "Checkout de testes" };

export default function Page() {
  return (
    <Suspense>
      <BillingSandboxScreen />
    </Suspense>
  );
}
