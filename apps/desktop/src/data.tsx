import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bridge, errorMessage, isCmdError, type Ops } from "./bridge";
import { createDemoOps, demoApi, demoGateway } from "./fixtures";
import type {
  Bootstrap,
  ConnectorDto,
  GatewayView,
  MeDto,
  OrbitPolicyDto,
  Period,
  QuotaSnapshot,
  RequestUsageEvent,
  SavingsSummary,
} from "./types";

/* ------------------------------ app context ------------------------------ */

type AppCtx = {
  boot: Bootstrap;
  gateway: GatewayView;
  reload: () => Promise<void>;
  demo: boolean;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ initial, children }: { initial: Bootstrap; children: ReactNode }) {
  const [boot, setBoot] = useState(initial);
  const [gateway, setGateway] = useState(initial.gateway);
  const reload = useCallback(async () => {
    const b = await bridge().bootstrap();
    setBoot(b);
    setGateway(b.gateway);
  }, []);
  useEffect(() => {
    const subs = [
      bridge().on<GatewayView>("maindy://gateway", setGateway),
      bridge().on("maindy://refresh", () => void reload()),
      bridge().on("maindy://settings", () => void reload()),
    ];
    return () => subs.forEach((p) => void p.then((u) => u()));
  }, [reload]);
  const demo = boot.settings.demoMode;
  const value = useMemo(
    () => ({ boot, gateway: demo && !gateway.healthy ? demoGateway() : gateway, reload, demo }),
    [boot, gateway, reload, demo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppProvider missing");
  return c;
}

/* ------------------------------ dashboard data ------------------------------ */

export type Res<T> = { data: T | null; error: string | null; code: string | null };

export type Dashboard = {
  me: Res<MeDto>;
  summary: Res<SavingsSummary>;
  runs: Res<RequestUsageEvent[]>;
  connectors: Res<ConnectorDto[]>;
  policy: Res<OrbitPolicyDto>;
  limits: Res<QuotaSnapshot[]>;
};

const EMPTY: Res<never> = { data: null, error: null, code: null };

export function periodRange(p: Period): { from: string; to: string } {
  const to = new Date();
  const ms = p === "24h" ? 86400e3 : p === "7d" ? 7 * 86400e3 : 30 * 86400e3;
  return { from: new Date(to.getTime() - ms).toISOString(), to: to.toISOString() };
}

/** Accepts `T[]` or `{ items | events | runs: T[] }` (paginated). */
export function asList<T>(v: unknown): T[] | null {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    for (const k of ["items", "events", "runs", "data"]) {
      const x = (v as Record<string, unknown>)[k];
      if (Array.isArray(x)) return x as T[];
    }
  }
  return v == null ? [] : null;
}

type Key = keyof Dashboard;

export function useDashboard(period: Period, keys: Key[] = ["me", "summary", "runs", "connectors", "policy", "limits"], pollMs = 60_000) {
  const { boot, demo } = useApp();
  const [d, setD] = useState<Dashboard>({ me: EMPTY, summary: EMPTY, runs: EMPTY, connectors: EMPTY, policy: EMPTY, limits: EMPTY });
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const pausedRef = useRef(false);

  const load = useCallback(async () => {
    if (!boot.paired && !demo) {
      setLoading(false);
      return;
    }
    const range = periodRange(period);
    const get = async <T,>(path: string, query?: Record<string, string>): Promise<Res<T>> => {
      try {
        const v = demo ? (demoApi(path, query, pausedRef.current) as T) : await bridge().apiGet<T>(path, query);
        return { data: v, error: null, code: null };
      } catch (e) {
        return { data: null, error: errorMessage(e), code: isCmdError(e) ? e.code : null };
      }
    };
    const ks = keysRef.current;
    const want = (k: Key) => ks.includes(k);
    const [me, summary, runsRaw, connectors, policy, limits] = await Promise.all([
      want("me") ? get<MeDto>("/v1/me") : EMPTY,
      want("summary") ? get<SavingsSummary>("/v1/stats/summary", range) : EMPTY,
      want("runs") ? get<unknown>("/v1/runs", { limit: "50" }) : EMPTY,
      want("connectors") ? get<ConnectorDto[]>("/v1/connectors") : EMPTY,
      want("policy") ? get<OrbitPolicyDto>("/v1/orbit/policy") : EMPTY,
      want("limits") ? get<QuotaSnapshot[]>("/v1/limits") : EMPTY,
    ]);
    const runs: Res<RequestUsageEvent[]> = runsRaw.error
      ? (runsRaw as Res<RequestUsageEvent[]>)
      : { data: asList<RequestUsageEvent>(runsRaw.data), error: null, code: null };
    setD({
      me: me as Res<MeDto>,
      summary: summary as Res<SavingsSummary>,
      runs,
      connectors: { ...(connectors as Res<ConnectorDto[]>), data: asList<ConnectorDto>(connectors.data) },
      policy: policy as Res<OrbitPolicyDto>,
      limits: { ...(limits as Res<QuotaSnapshot[]>), data: asList<QuotaSnapshot>(limits.data) },
    });
    setUpdatedAt(new Date());
    setLoading(false);
  }, [boot.paired, demo, period]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = window.setInterval(() => void load(), pollMs);
    const un = bridge().on("maindy://refresh", () => void load());
    return () => {
      window.clearInterval(t);
      void un.then((u) => u());
    };
  }, [load, pollMs]);

  /** Demo mode keeps the pause toggle client-side so the UI reflects it. */
  const setDemoPaused = useCallback(
    (p: boolean) => {
      pausedRef.current = p;
      void load();
    },
    [load],
  );

  return { ...d, loading, updatedAt, reload: load, setDemoPaused };
}

/* ------------------------------ derived state ------------------------------ */

export type OrbitStatus = "active" | "paused" | "observing" | "offline" | "unknown";

export function orbitStatus(policy: OrbitPolicyDto | null, gw: GatewayView): OrbitStatus {
  const gwPaused = gw.status?.paused;
  if (policy?.paused || gwPaused) return "paused";
  if (policy && policy.mode === "observe") return "observing";
  if (policy) return "active";
  if (gw.healthy) return gw.status?.mode === "observe" ? "observing" : "active";
  return "unknown";
}

export const orbitStatusLabel: Record<OrbitStatus, string> = {
  active: "ORBIT ativo",
  paused: "ORBIT pausado",
  observing: "Somente observação",
  offline: "Sem conexão",
  unknown: "Status indisponível",
};

export function gatewayLabel(gw: GatewayView): string {
  switch (gw.phase) {
    case "not_installed":
      return "Gateway local não instalado";
    case "disabled":
      return "Gateway local desativado";
    case "starting":
      return "Gateway local iniciando…";
    case "running":
      return "Gateway local ativo";
    case "external":
      return "Gateway local ativo (externo)";
    case "crashed":
      return gw.nextRetryInSecs != null ? `Gateway reiniciando em ${gw.nextRetryInSecs}s` : "Gateway reiniciando…";
  }
}

/** Distinct sessions in recent runs (Claude Code / Codex / agents). */
export function sessionsFrom(runs: RequestUsageEvent[] | null) {
  const map = new Map<string, { key: string; project: string | null; agent: string | null; connector: string; model: string; requests: number; tokens: number; last: string; source: RequestUsageEvent["usage"]["source"] }>();
  for (const r of runs ?? []) {
    if (!r.sessionKey) continue;
    const s = map.get(r.sessionKey) ?? { key: r.sessionKey, project: r.projectKey, agent: r.agentKey, connector: r.connector, model: r.model, requests: 0, tokens: 0, last: r.occurredAt, source: r.usage.source };
    s.requests += 1;
    s.tokens += r.usage.inputTokens + r.usage.outputTokens;
    if (r.occurredAt > s.last) s.last = r.occurredAt;
    map.set(r.sessionKey, s);
  }
  return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
}

export type Dash = ReturnType<typeof useDashboard>;

/* ------------------------------ operations & generic resources ------------------------------ */

let demoOps: Ops | null = null;

/** Real operations (Rust) — or labeled, client-side fakes while demo mode is on. */
export function useOps(): Ops {
  const { demo } = useApp();
  if (demo) {
    demoOps ??= createDemoOps("demo");
    return demoOps;
  }
  return bridge();
}

/** API read through Rust (device token never in JS); demo mode answers from fixtures. */
export function useApiGet() {
  const { demo } = useApp();
  return useCallback(
    async <T,>(path: string, query?: Record<string, string>): Promise<T> => (demo ? (demoApi(path, query) as T) : bridge().apiGet<T>(path, query)),
    [demo],
  );
}

export type Resource<T> = Res<T> & { loading: boolean; reload: () => Promise<void> };

/** Loads `fn` on mount / when `deps` change and on every "maindy://refresh". */
export function useResource<T>(fn: () => Promise<T>, deps: unknown[], pollMs = 0): Resource<T> {
  const [r, setR] = useState<Res<T>>({ data: null, error: null, code: null });
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (my === seq.current) setR({ data: v, error: null, code: null });
    } catch (e) {
      if (my === seq.current) setR({ data: null, error: errorMessage(e), code: isCmdError(e) ? e.code : null });
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const un = bridge().on("maindy://refresh", () => void reload());
    const t = pollMs > 0 ? window.setInterval(() => void reload(), pollMs) : 0;
    return () => {
      if (t) window.clearInterval(t);
      void un.then((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...r, loading, reload };
}

/** Async action state for buttons: idle → busy → ok | error (pt-BR message). */
export type ActionState = { busy: boolean; ok: string | null; error: string | null };

export function useAction() {
  const [s, setS] = useState<ActionState>({ busy: false, ok: null, error: null });
  const run = useCallback(async <T,>(fn: () => Promise<T>, okMsg?: string | ((v: T) => string | null)): Promise<T | undefined> => {
    setS({ busy: true, ok: null, error: null });
    try {
      const v = await fn();
      const msg = typeof okMsg === "function" ? okMsg(v) : (okMsg ?? null);
      setS({ busy: false, ok: msg, error: null });
      return v;
    } catch (e) {
      setS({ busy: false, ok: null, error: errorMessage(e) });
      return undefined;
    }
  }, []);
  const reset = useCallback(() => setS({ busy: false, ok: null, error: null }), []);
  return { ...s, run, reset, set: setS };
}
