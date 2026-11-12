import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { ConsentForm } from '@/components/auth/ConsentForm';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Seus dados', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/entrar?erro=session');

  return (
    <AuthShell
      title="Antes de continuar"
      subtitle="Precisamos do seu consentimento para cuidar das suas informações com transparência."
    >
      <ConsentForm tipo={tipo === 'signup' ? 'signup' : 'login'} />
    </AuthShell>
  );
}
