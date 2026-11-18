import { Suspense } from "react";
import type { Metadata } from "next";
import { PairDeviceScreen } from "@/components/app/screens/pair-device";

export const metadata: Metadata = { title: "Parear dispositivo" };

export default function Page() {
  return (
    <Suspense>
      <PairDeviceScreen />
    </Suspense>
  );
}
