import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { getEnabledProviders } from '@/lib/supabase/server';
import { QUERY_ERRORS } from '@/lib/auth/errors';

export const metadata: Metadata = { title: 'Entrar', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const providers = await getEnabledProviders();
  return (
    <AuthShell
      title="Que bom ter você de volta"
      subtitle="Entre para continuar de onde parou."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link href="/cadastro" className="font-medium text-white underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <LoginForm providers={providers} initialError={erro ? QUERY_ERRORS[erro] : undefined} />
    </AuthShell>
  );
}
