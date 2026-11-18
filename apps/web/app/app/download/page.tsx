import type { Metadata } from "next";
import { DownloadScreen } from "@/components/app/screens/download";

export const metadata: Metadata = { title: "Download" };

export default function Page() {
  return <DownloadScreen />;
}
