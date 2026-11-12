import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/PasswordForms';

export const metadata: Metadata = { title: 'Recuperar senha', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Esqueceu a senha?"
      subtitle="Acontece. Informe seu e-mail e enviaremos um link para criar uma nova."
      footer={
        <Link href="/entrar" className="font-medium text-white underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
