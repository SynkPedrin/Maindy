import { Suspense } from "react";
import type { Metadata } from "next";
import { EconomyScreen } from "@/components/app/screens/economy";

export const metadata: Metadata = { title: "Economia" };

export default function Page() {
  return (
    <Suspense>
      <EconomyScreen />
    </Suspense>
  );
}
