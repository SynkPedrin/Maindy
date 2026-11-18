"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MailCheck, Sparkles } from "lucide-react";
import type { PlanCode } from "@maindy/contracts";
import { ApiClientError, apiVoid, errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, FormError, StatusIcon } from "./auth-card";
import { PasswordStrength } from "./password-strength";
import { ResendVerification } from "./resend-verification";

export const PLAN_NAMES: Record<PlanCode, string> = { starter: "Starter", pro: "Pro", master_economy: "Master Economy" };

export function SignupForm({ planCode }: { planCode?: PlanCode }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Partial<Record<"name" | "email" | "password" | "terms", string>>>({});
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof fieldErr = {};
    if (name.trim().length < 2) fe.name = "Informe seu nome.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fe.email = "Informe um e-mail válido.";
    if (password.length < 10) fe.password = "A senha precisa ter pelo menos 10 caracteres.";
    if (!acceptTerms) fe.terms = "Para criar a conta, aceite os Termos e a Política de Privacidade.";
    setFieldErr(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError(null);
    try {
      await apiVoid("/v1/auth/signup", {
        method: "POST",
        body: { name: name.trim(), email: email.trim().toLowerCase(), password, acceptTerms: true, marketingOptIn: marketing, ...(planCode ? { planCode } : {}) },
      });
      setSentTo(email.trim().toLowerCase());
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        setError(err.message || "Já existe uma conta com este e-mail.");
      } else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Verifique seu e-mail"
        subtitle={
          <>
            Enviamos um link de confirmação para <strong className="font-medium text-fg">{sentTo}</strong>. Abra-o neste dispositivo para ativar sua conta. O link expira em breve.
          </>
        }
        footer={
          <>
            E-mail errado?{" "}
            <button type="button" onClick={() => setSentTo(null)} className="text-fg underline-offset-4 hover:underline">
              Voltar e corrigir
            </button>
          </>
        }
      >
        <div className="-mt-2">
          <StatusIcon tone="violet">
            <MailCheck />
          </StatusIcon>
          <ul className="mb-6 space-y-2 text-[13px] text-muted">
            <li>• Procure por “maindy.” na caixa de entrada e no spam.</li>
            <li>• Ao confirmar, você entra direto — sem precisar digitar a senha de novo.</li>
          </ul>
          <ResendVerification email={sentTo} />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Crie sua conta"
      subtitle="Comece em modo observação: medimos seu uso real antes de otimizar qualquer coisa."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      {planCode ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface-2/60 px-3.5 py-2.5 text-[13px]">
          <span className="flex items-center gap-2 text-muted">
            <Sparkles className="size-4 text-gold" aria-hidden /> Plano escolhido: <strong className="font-medium text-fg">{PLAN_NAMES[planCode]}</strong>
          </span>
          <Link href="/precos" className="text-subtle hover:text-fg">
            Trocar
          </Link>
        </div>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError>{error}</FormError>
        <Field label="Nome" error={fieldErr.name}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} required />
          )}
        </Field>
        <Field label="E-mail de trabalho" error={fieldErr.email}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} required />
          )}
        </Field>
        <Field label="Senha" error={fieldErr.password}>
          {({ id, describedBy, invalid }) => (
            <>
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={[describedBy, `${id}-strength`].filter(Boolean).join(" ")}
                aria-invalid={invalid}
                minLength={10}
                required
              />
              <PasswordStrength password={password} id={`${id}-strength`} />
            </>
          )}
        </Field>
        <div className="flex flex-col gap-3 pt-1">
          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-muted">
            <input type="checkbox" name="acceptTerms" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--m-violet)]" aria-invalid={!!fieldErr.terms} />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" target="_blank" className="text-fg underline underline-offset-2">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" target="_blank" className="text-fg underline underline-offset-2">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
          {fieldErr.terms ? (
            <p role="alert" className="-mt-1 text-xs text-error">
              {fieldErr.terms}
            </p>
          ) : null}
          <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-muted">
            <input type="checkbox" name="marketingOptIn" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--m-violet)]" />
            <span>Quero receber novidades e dicas de economia por e-mail (opcional).</span>
          </label>
        </div>
        <Button type="submit" size="lg" loading={busy} className="mt-2 w-full">
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
