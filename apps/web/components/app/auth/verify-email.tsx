"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MailX } from "lucide-react";
import { MeDto } from "@maindy/contracts";
import { api, errorMessage, ApiClientError } from "@/lib/api/client";
import { ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AuthCard, StatusIcon } from "./auth-card";
import { ResendVerification } from "./resend-verification";

type State = { kind: "loading" } | { kind: "ok"; me: MeDto } | { kind: "error"; message: string; expired: boolean };

export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(token ? { kind: "loading" } : { kind: "error", message: "O link está incompleto.", expired: false });
  const [email, setEmail] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api("/v1/auth/verify-email", MeDto, { method: "POST", body: { token } })
      .then((me) => setState({ kind: "ok", me }))
      .catch((err) => {
        const expired = err instanceof ApiClientError && (err.code === "invalid_token" || /expired|expirado/i.test(err.code));
        setState({ kind: "error", message: errorMessage(err), expired });
      });
  }, [token]);

  if (state.kind === "loading") {
    return (
      <AuthCard title="Confirmando seu e-mail…" subtitle="Só um instante.">
        <div className="flex justify-center py-4" role="status" aria-label="Confirmando">
          <Loader2 className="size-6 animate-spin text-muted" />
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "ok") {
    const first = state.me.user.name.split(" ")[0];
    return (
      <AuthCard
        title="E-mail confirmado"
        subtitle={
          <>
            Boas-vindas, {first}. Sua conta e a organização <strong className="font-medium text-fg">{state.me.organization.name}</strong> estão prontas — você já está conectado.
          </>
        }
      >
        <div className="-mt-2">
          <StatusIcon tone="success">
            <CheckCircle2 />
          </StatusIcon>
          <p className="mb-6 text-[13px] leading-relaxed text-muted">
            Próximo passo: um checklist curto para escolher o plano, instalar o app e começar a medição em modo observação. Você pode pausar e retomar quando quiser.
          </p>
          <ButtonLink href="/app/onboarding" size="lg" className="w-full">
            Continuar para o onboarding
          </ButtonLink>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={state.expired ? "Link inválido ou expirado" : "Não foi possível confirmar"}
      subtitle={state.expired ? "Este link já foi usado ou passou da validade. Informe seu e-mail para receber um novo." : `${state.message} Peça um novo link abaixo.`}
      footer={
        <a href="/login" className="text-fg underline-offset-4 hover:underline">
          Ir para o login
        </a>
      }
    >
      <div className="-mt-2 flex flex-col gap-4">
        <StatusIcon tone="error">
          <MailX />
        </StatusIcon>
        <Field label="Seu e-mail">
          {({ id }) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <ResendVerification email={email.trim().toLowerCase()} startWithCooldown={false} />
      </div>
    </AuthCard>
  );
}
