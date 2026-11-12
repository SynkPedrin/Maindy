import type { Metadata, Viewport } from 'next';
import { Inter, Poppins } from 'next/font/google';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { publicEnv } from '@/lib/env';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const title = 'MAINDY | Sua segunda memória. Sempre por perto.';
const description =
  'A MAINDY é uma inteligência artificial pessoal que ajuda você a lembrar, organizar e recuperar aquilo que realmente importa. Entre para a lista de acesso antecipado.';

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: title, template: '%s | MAINDY' },
  description,
  applicationName: 'MAINDY',
  keywords: ['MAINDY', 'segunda memória', 'assistente pessoal', 'inteligência artificial', 'organização', 'lembretes', 'second brain'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: '/',
    siteName: 'MAINDY',
    title,
    description,
    images: [{ url: '/assets/maindy/backgrounds/og-image.jpg', width: 1200, height: 675, alt: 'MAINDY' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/assets/maindy/backgrounds/og-image.jpg'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#05082B',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-navy"
        >
          Pular para o conteúdo
        </a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
