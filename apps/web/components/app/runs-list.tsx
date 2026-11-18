import type { RunDto } from "@/lib/api/schemas";
import { Badge } from "@/components/ui/badge";
import { MeasurementBadge } from "@/components/ui/measurement-badge";
import { connectorKindLabel, formatLatency, formatMoney, formatTokens, relativeTime, runStatusLabel, techniqueLabel } from "./format";

const statusTone: Record<string, "success" | "violet" | "error" | "warning" | "neutral"> = {
  ok: "neutral",
  cache_hit: "violet",
  error: "error",
  blocked: "warning",
  fallback: "warning",
};

export function RunsList({ runs, now }: { runs: RunDto[]; now?: number }) {
  return (
    <ul className="divide-y divide-line">
      {runs.map((r, i) => {
        const saved = r.baselineCost && r.cost ? r.baselineCost.micros - r.cost.micros : null;
        const applied = (r.techniques ?? []).filter((t) => t.applied !== false);
        return (
          <li key={r.id ?? r.eventId ?? i} className="flex items-start gap-4 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-[12.5px] text-fg">{r.model ?? "modelo desconhecido"}</span>
                <Badge tone={statusTone[r.status] ?? "neutral"} className="h-5 shrink-0 px-2 text-[10.5px]">
                  {runStatusLabel[r.status] ?? r.status}
                </Badge>
              </div>
              <div className="mt-0.5 truncate text-[11.5px] text-subtle">
                {[r.connector ? connectorKindLabel[r.connector] ?? r.connector : r.provider, r.projectKey, relativeTime(r.occurredAt, now)].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-1.5 flex min-w-0 flex-wrap gap-1">
                {applied.length ? (
                  applied.slice(0, 2).map((t) => (
                    <span key={t.name} className="max-w-full truncate rounded-[6px] border border-line px-1.5 py-px text-[10.5px] text-muted">
                      {techniqueLabel[t.name] ?? t.name}
                    </span>
                  ))
                ) : (
                  <span className="text-[10.5px] text-subtle">sem otimização</span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="m-num flex items-center justify-end gap-1.5 text-[13px] text-fg">
                {r.cost ? formatMoney(r.cost.micros, r.cost.currency) : "—"}
                {r.cost ? <MeasurementBadge source={r.cost.source} compact /> : null}
              </div>
              {saved != null && saved > 0 ? <div className="m-num mt-0.5 text-[11.5px] text-success">−{formatMoney(saved, r.cost?.currency)} vs. baseline</div> : null}
              <div className="m-num mt-0.5 text-[11px] text-subtle">
                {formatLatency(r.latencyMs)}
                {r.usage ? ` · ${formatTokens(r.usage.inputTokens + r.usage.outputTokens)} tok` : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
