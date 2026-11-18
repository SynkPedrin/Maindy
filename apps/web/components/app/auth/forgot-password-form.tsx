"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { apiVoid, errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, FormError, StatusIcon } from "./auth-card";

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Informe um e-mail válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiVoid("/v1/auth/forgot-password", { method: "POST", body: { email: email.trim().toLowerCase() } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard
        title="Confira seu e-mail"
        subtitle="Se existir uma conta com esse endereço, enviamos um link para criar uma nova senha. Ele expira em breve."
        footer={
          <Link href="/login" className="text-fg underline-offset-4 hover:underline">
            Voltar ao login
          </Link>
        }
      >
        <StatusIcon tone="violet">
          <KeyRound />
        </StatusIcon>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Enviaremos um link seguro para você definir uma nova senha."
      footer={
        <Link href="/login" className="text-fg underline-offset-4 hover:underline">
          Lembrei a senha
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{error}</FormError>
        <Field label="E-mail">
          {({ id }) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />}
        </Field>
        <Button type="submit" size="lg" loading={busy} className="mt-2 w-full">
          Enviar link
        </Button>
      </form>
    </AuthCard>
  );
}
