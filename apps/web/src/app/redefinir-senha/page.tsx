import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/PasswordForms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Nova senha', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/entrar?erro=link');
  return (
    <AuthShell title="Crie uma nova senha" subtitle="Depois de salvar, você entra direto na MAINDY.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
