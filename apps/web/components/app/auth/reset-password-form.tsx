"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { apiVoid, errorMessage } from "@/lib/api/client";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, FormError, StatusIcon } from "./auth-card";
import { PasswordStrength } from "./password-strength";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthCard title="Link inválido" subtitle="Este link de redefinição está incompleto. Peça um novo.">
        <ButtonLink href="/esqueci-senha" size="lg" className="w-full">
          Pedir novo link
        </ButtonLink>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError("A senha precisa ter pelo menos 10 caracteres.");
    if (password !== confirm) return setError("As senhas não coincidem.");
    setBusy(true);
    setError(null);
    try {
      await apiVoid("/v1/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="Senha redefinida" subtitle="Por segurança, encerramos todas as sessões abertas, inclusive em outros dispositivos.">
        <StatusIcon tone="success">
          <ShieldCheck />
        </StatusIcon>
        <ButtonLink href="/login?motivo=senha" size="lg" className="w-full">
          Entrar com a nova senha
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Defina uma nova senha"
      subtitle="Depois de salvar, todas as sessões serão encerradas."
      footer={
        <Link href="/esqueci-senha" className="text-fg underline-offset-4 hover:underline">
          Pedir outro link
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{error}</FormError>
        <Field label="Nova senha">
          {({ id }) => (
            <>
              <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={`${id}-s`} autoFocus />
              <PasswordStrength password={password} id={`${id}-s`} />
            </>
          )}
        </Field>
        <Field label="Confirmar nova senha">
          {({ id }) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" loading={busy} className="mt-2 w-full">
          Salvar nova senha
        </Button>
      </form>
    </AuthCard>
  );
}
