import "./marketing.css";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Ambient } from "@/components/marketing/ambient";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-bg"
      >
        Pular para o conteúdo
      </a>
      <Ambient />
      <SiteHeader />
      <main id="conteudo" className="relative overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
