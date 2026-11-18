"use client";
import { cn } from "@/lib/cn";

export function scorePassword(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 2) s++;
  if (classes >= 3 && pw.length >= 12) s++;
  if (/^(.)\1+$/.test(pw) || /^(123|abc|senha|password|qwerty)/i.test(pw)) s = Math.min(s, 1);
  if (pw.length < 10) s = Math.min(s, 1);
  return s as 0 | 1 | 2 | 3 | 4;
}

const labels = ["", "Fraca", "Razoável", "Boa", "Forte"] as const;

export function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const score = scorePassword(password);
  const color = score <= 1 ? "bg-error" : score === 2 ? "bg-warning" : "bg-success";
  return (
    <div id={id} className="mt-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full bg-surface-3 transition-colors", password && i <= Math.max(score, 1) && color)} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-subtle">
        {password.length === 0
          ? "Use pelo menos 10 caracteres. Frases longas são fortes e fáceis de lembrar."
          : password.length < 10
            ? `Faltam ${10 - password.length} caractere(s) para o mínimo.`
            : `Força: ${labels[score] || "Fraca"}${score < 3 ? " — misture maiúsculas, números ou símbolos, ou use uma frase mais longa." : "."}`}
      </p>
    </div>
  );
}
