import { Suspense } from "react";
import type { Metadata } from "next";
import { QualityScreen } from "@/components/app/screens/quality";

export const metadata: Metadata = { title: "Qualidade" };

export default function Page() {
  return (
    <Suspense>
      <QualityScreen />
    </Suspense>
  );
}
