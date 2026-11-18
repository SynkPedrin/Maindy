"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MailWarning } from "lucide-react";
import { ApiClientError, apiVoid, errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, FormError, StatusIcon } from "./auth-card";
import { ResendVerification } from "./resend-verification";

const REASONS: Record<string, string> = {
  sessao: "Sua sessão terminou. Entre novamente para continuar.",
  senha: "Senha redefinida. Por segurança, todas as sessões foram encerradas — entre com a nova senha.",
  saiu: "Você saiu da sua conta.",
};

export function LoginForm({ next, reason, initialEmail }: { next: string; reason?: string; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [unverified, setUnverified] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setBusy(true);
    setError(null);
    setRateLimited(false);
    try {
      await apiVoid("/v1/auth/login", { method: "POST", body: { email: email.trim().toLowerCase(), password } });
      // Full navigation so the server layout re-checks the new session cookie.
      window.location.assign(next);
      return;
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "email_not_verified") {
        setUnverified(email.trim().toLowerCase());
      } else if (err instanceof ApiClientError && err.status === 429) {
        setRateLimited(true);
        setError(err.message || "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.");
      } else {
        setError(errorMessage(err));
      }
    }
    setBusy(false);
  }

  if (unverified) {
    return (
      <AuthCard
        title="Confirme seu e-mail para entrar"
        subtitle={
          <>
            A conta <strong className="font-medium text-fg">{unverified}</strong> ainda não foi verificada. Abra o link que enviamos ou peça um novo.
          </>
        }
        footer={
          <button type="button" onClick={() => setUnverified(null)} className="text-fg underline-offset-4 hover:underline">
            Voltar ao login
          </button>
        }
      >
        <div className="-mt-2">
          <StatusIcon tone="warning">
            <MailWarning />
          </StatusIcon>
          <ResendVerification email={unverified} startWithCooldown={false} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Entrar na maindy."
      subtitle="Acompanhe sua economia, conexões e o ORBIT Engine."
      footer={
        <>
          Novo por aqui?{" "}
          <Link href="/cadastro" className="font-medium text-fg underline-offset-4 hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {reason && REASONS[reason] && !error ? (
          <div role="status" className="rounded-[12px] border border-line bg-surface-2/60 px-3.5 py-2.5 text-[13px] text-muted">
            {REASONS[reason]}
          </div>
        ) : null}
        <FormError>{error ? <span data-rate-limited={rateLimited || undefined}>{error}</span> : null}</FormError>
        <Field label="E-mail">
          {({ id, describedBy }) => (
            <Input id={id} name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} required autoFocus={!initialEmail} />
          )}
        </Field>
        <Field
          label="Senha"
          trailing={
            <Link href={`/esqueci-senha${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-[12px] text-subtle hover:text-fg">
              Esqueci a senha
            </Link>
          }
        >
          {({ id, describedBy }) => (
            <Input id={id} name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby={describedBy} required />
          )}
        </Field>
        <Button type="submit" size="lg" loading={busy} disabled={rateLimited && busy} className="mt-2 w-full">
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}
