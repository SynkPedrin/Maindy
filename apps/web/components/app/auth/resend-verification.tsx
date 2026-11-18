"use client";
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { apiVoid, errorMessage } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

/** Resend the verification e-mail with a client-side cooldown (server also rate-limits). */
export function ResendVerification({ email, cooldownSeconds = 60, startWithCooldown = true }: { email: string; cooldownSeconds?: number; startWithCooldown?: boolean }) {
  const [left, setLeft] = useState(startWithCooldown ? cooldownSeconds : 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  async function resend() {
    setBusy(true);
    setMsg(null);
    try {
      await apiVoid("/v1/auth/resend-verification", { method: "POST", body: { email } });
      setMsg({ ok: true, text: "Se houver uma conta pendente para este e-mail, enviamos um novo link." });
      setLeft(cooldownSeconds);
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" size="lg" className="w-full" onClick={resend} loading={busy} disabled={left > 0 || !email}>
        {!busy ? <RotateCw className="size-4" aria-hidden /> : null}
        {left > 0 ? `Reenviar em ${left}s` : "Reenviar e-mail de verificação"}
      </Button>
      {msg ? (
        <p role="status" className={msg.ok ? "text-[13px] text-muted" : "text-[13px] text-error"}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
