import { connectorStatusLabel, formatMoney, formatTokens, measurementLabel } from "@maindy/design-system";
import { Check, Copy, Loader2 } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ActionState } from "../data";
import type { ConnectorDto } from "../types";
import type { MeasurementSource, Money } from "../types";
import { DEMO_LABEL } from "../fixtures";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export const sourceShort: Record<MeasurementSource, string> = {
  provider_reported: "Provedor",
  locally_measured: "Medido",
  experimentally_estimated: "Estimado",
  unavailable: "Indisponível",
};

/** Provenance badge shown next to every number (MeasurementSource). */
export function SourceBadge({ source, compact }: { source: MeasurementSource; compact?: boolean }) {
  return (
    <span className={cx("src", `src-${source}`)} title={measurementLabel[source]} aria-label={`Origem: ${measurementLabel[source]}`}>
      <i aria-hidden />
      {compact ? sourceShort[source] : measurementLabel[source]}
    </span>
  );
}

export function money(m: Money | null | undefined): string {
  if (!m || m.source === "unavailable") return "indisponível";
  return formatMoney(m.micros, m.currency);
}

export function tokens(n: number | null | undefined, source?: MeasurementSource): string {
  if (n == null || source === "unavailable") return "indisponível";
  return formatTokens(n);
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "indisponível";
  return `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
}

export function ago(isoStr: string | null | undefined): string {
  if (!isoStr) return "nunca";
  const s = Math.round((Date.now() - Date.parse(isoStr)) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `em ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `em ${Math.round(f / 3600)} h`;
    return `em ${Math.round(f / 86400)} d`;
  }
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

export function Orb({ size = 24, active, className }: { size?: number; active?: boolean; className?: string }) {
  return (
    <span className={cx("orb", active && "orb-active", className)} style={{ width: size, height: size }} aria-hidden>
      <img src={size > 64 ? "./brand/orb-320.webp" : size > 32 ? "./brand/orb-160.webp" : "./brand/orb-96.webp"} alt="" draggable={false} />
    </span>
  );
}

export function Wordmark({ height = 20 }: { height?: number }) {
  return <img className="wordmark" src="./brand/wordmark-white-640.webp" alt="maindy." style={{ height }} draggable={false} />;
}

export function DemoBanner({ compact }: { compact?: boolean }) {
  return (
    <div className={cx("demo-banner", compact && "compact")} role="note">
      <span aria-hidden>◆</span> {DEMO_LABEL}
    </div>
  );
}

export function Card({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card", className)}>
      {(title || aside) && (
        <header className="card-h">
          {title && <h3>{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Metric({
  label,
  value,
  source,
  hint,
  tone,
}: {
  label: string;
  value: string;
  source: MeasurementSource;
  hint?: ReactNode;
  tone?: "success" | "default";
}) {
  const unavailable = source === "unavailable" || value === "indisponível";
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={cx("metric-value", unavailable && "is-na", tone === "success" && !unavailable && "is-success")}>
        {unavailable ? "indisponível" : value}
      </div>
      <div className="metric-foot">
        <SourceBadge source={unavailable ? "unavailable" : source} compact />
        {hint && <span className="metric-hint">{hint}</span>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorLine({ message }: { message: string }) {
  return (
    <div className="error-line" role="status">
      {message}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx("toggle-row", disabled && "is-disabled")}>
      <span className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={cx("switch", checked && "on")}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </label>
  );
}

export function StatusDot({ tone }: { tone: "ok" | "warn" | "error" | "idle" | "violet" }) {
  return <span className={cx("dot", `dot-${tone}`)} aria-hidden />;
}

export function Bar({ value, max, tone = "violet", label }: { value: number; max: number; tone?: "violet" | "gold" | "muted" | "success"; label: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i className={`bar-${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

/* ------------------------------ actions ------------------------------ */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "ghost" | "danger" | "default";
  size?: "sm" | "md";
  busy?: boolean;
  icon?: ReactNode;
};

/** Button with a loading state (spinner + aria-busy); disabled while busy. */
export function Btn({ kind = "default", size = "md", busy, icon, children, className, disabled, type = "button", ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cx("btn", kind !== "default" && `btn-${kind}`, size === "sm" && "btn-sm", busy && "is-busy", className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Loader2 size={14} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** Success / error line for an action (announced to screen readers). */
export function ActionMsg({ s, className }: { s: Pick<ActionState, "ok" | "error">; className?: string }) {
  if (s.error)
    return (
      <p className={cx("act-msg act-err", className)} role="alert">
        {s.error}
      </p>
    );
  if (s.ok)
    return (
      <p className={cx("act-msg act-ok", className)} role="status">
        <Check size={13} aria-hidden /> {s.ok}
      </p>
    );
  return null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState<null | boolean>(null);
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost copy-btn"
      onClick={async () => {
        setDone(await copyText(text));
        window.setTimeout(() => setDone(null), 1800);
      }}
      aria-label={label}
    >
      {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {done === null ? label : done ? "Copiado" : "Falhou"}
    </button>
  );
}

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className={cx("codeblock", !label && "codeblock-bare")}>
      <div className="codeblock-h">
        {label && <span>{label}</span>}
        <CopyButton text={code} />
      </div>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const connectorTone = (s: ConnectorDto["status"]) =>
  s === "optimization_active" ? "violet" : s === "connected_read_only" ? "ok" : s === "attention" ? "warn" : s === "unavailable" ? "error" : "idle";

/** Status chip derived by the API from real traffic, with the last activity. */
export function ConnectorStatus({ c }: { c: ConnectorDto | undefined }) {
  if (!c) return <span className="chip chip-sm">status indisponível</span>;
  return (
    <span className="conn-status">
      <span className={cx("chip", "chip-sm", `chip-cs-${c.status}`)}>
        <StatusDot tone={connectorTone(c.status)} />
        {connectorStatusLabel[c.status]}
      </span>
      <span className="muted conn-sync">{c.lastSyncAt ? `última atividade ${ago(c.lastSyncAt)}` : "sem atividade registrada"}</span>
    </span>
  );
}

/** ✓ / ✗ line for detection checklists. */
export function Check2({ ok, children, hint }: { ok: boolean | null; children: ReactNode; hint?: ReactNode }) {
  return (
    <li className={cx("chk", ok === true && "chk-ok", ok === false && "chk-no")}>
      <span className="chk-i" aria-hidden>
        {ok === true ? "✓" : ok === false ? "–" : "?"}
      </span>
      <span className="chk-t">
        {children}
        <span className="sr-only">{ok === true ? ": sim" : ok === false ? ": não" : ": indisponível"}</span>
      </span>
      {hint && <span className="chk-h">{hint}</span>}
    </li>
  );
}
