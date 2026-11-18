import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { Film } from "@/components/cinematic/Film";
import { JsonLd, orgAndAppSchema } from "@/components/marketing/json-ld";
import { getPlans } from "@/components/marketing/plans";
import { FaqSection } from "@/components/marketing/sections/closing";
import { Guarantee } from "@/components/marketing/sections/guarantee";
import { PlansTeaser } from "@/components/marketing/sections/plans-teaser";
import { getOrbitDemo } from "@/lib/lp/orbit-demo";

export const revalidate = 300;

// Editorial contrast face, used sparingly (one word per headline at most).
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["italic"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: "maindy. — Sua IA trabalha mais. Você gasta menos." },
  description:
    "Uma camada inteligente para reduzir desperdícios de IA em APIs, agentes e ferramentas de desenvolvimento. Gateway local, ORBIT Engine™ e economia medida contra baseline real.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "maindy. — Sua IA trabalha mais. Você gasta menos.",
    description: "Reduza desperdícios de IA em APIs, agentes e ferramentas de desenvolvimento. Powered by ORBIT Engine™.",
    url: "/",
  },
};

export default async function HomePage() {
  const plans = await getPlans();
  const demo = getOrbitDemo();
  return (
    <div className={serif.variable}>
      <JsonLd data={orgAndAppSchema()} />
      <Film demo={demo} />
      {/* Epilogue: the practical details, in normal document flow above the film layer */}
      <div className="relative z-20 bg-bg">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-40 bg-gradient-to-b from-transparent to-bg" />
        <PlansTeaser data={plans} />
        <Guarantee />
        <FaqSection />
      </div>
    </div>
  );
}
