import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from '@/components/auth/SignupForm';
import { getEnabledProviders } from '@/lib/supabase/server';
import { QUERY_ERRORS } from '@/lib/auth/errors';

export const metadata: Metadata = { title: 'Criar conta', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const providers = await getEnabledProviders();
  return (
    <AuthShell
      title="Crie sua MAINDY"
      subtitle="Sua segunda memória começa aqui. Leva menos de um minuto."
      footer={
        <>
          Já tem conta?{' '}
          <Link href="/entrar" className="font-medium text-white underline-offset-4 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <SignupForm providers={providers} initialError={erro ? QUERY_ERRORS[erro] : undefined} />
    </AuthShell>
  );
}
