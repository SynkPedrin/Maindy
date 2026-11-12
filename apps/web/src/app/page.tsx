import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ScrollProgress } from '@/components/layout/ScrollProgress';
import { PageView } from '@/components/layout/PageView';
import { Hero } from '@/components/sections/Hero';
import { Problem } from '@/components/sections/Problem';
import { Solution } from '@/components/sections/Solution';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Features } from '@/components/sections/Features';
import { InteractiveOrb } from '@/components/sections/InteractiveOrb';
import { Personalization } from '@/components/sections/Personalization';
import { Privacy } from '@/components/sections/Privacy';
import { Vision } from '@/components/sections/Vision';
import { FAQ } from '@/components/sections/FAQ';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { faqs } from '@/components/sections/faq-data';
import { publicEnv } from '@/lib/env';

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'MAINDY',
      url: publicEnv.siteUrl,
      logo: `${publicEnv.siteUrl}/assets/maindy/logo/maindy-symbol.png`,
    },
    {
      '@type': 'SoftwareApplication',
      name: 'MAINDY',
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'iOS, Android',
      description: 'Inteligência artificial pessoal que funciona como uma segunda memória: registre, organize e recupere informações por voz ou texto.',
      offers: { '@type': 'Offer', availability: 'https://schema.org/PreOrder', price: '0', priceCurrency: 'BRL' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <PageView />
      <ScrollProgress />
      <Navbar />
      <main id="conteudo">
        <Hero />
        <Problem />
        <Solution />
        <HowItWorks />
        <Features />
        <InteractiveOrb />
        <Personalization />
        <Privacy />
        <Vision />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
