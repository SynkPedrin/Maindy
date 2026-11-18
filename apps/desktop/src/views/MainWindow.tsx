import {
  BadgeCheck,
  Bot,
  CreditCard,
  ExternalLink,
  FileText,
  Gauge,
  Home,
  Orbit as OrbitIcon,
  Pause,
  Play,
  PlugZap,
  Settings2,
  PiggyBank,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { bridge, errorMessage } from "../bridge";
import { gatewayLabel, orbitStatus, orbitStatusLabel, useApp, useDashboard } from "../data";
import type { ConnectorKind, Period, Route, Section } from "../types";
import { DemoBanner, StatusDot, Wordmark, cx, ago } from "../ui";
import { Pairing } from "./Pairing";
import { Overview } from "./sections/Overview";
import { Savings } from "./sections/Savings";
import { Integrations } from "./sections/Integrations";
import { Projects } from "./sections/Projects";
import { Limits } from "./sections/Limits";
import { OrbitEngine } from "./sections/OrbitEngine";
import { Quality } from "./sections/Quality";
import { Reports } from "./sections/Reports";
import { Billing } from "./sections/Billing";
import { SettingsSection } from "./sections/Settings";

const NAV: Array<{ id: Section; label: string; icon: ReactNode; external?: boolean }> = [
  { id: "overview", label: "Overview", icon: <Home size={17} /> },
  { id: "savings", label: "Economia", icon: <PiggyBank size={17} /> },
  { id: "integrations", label: "Integrações", icon: <PlugZap size={17} /> },
  { id: "projects", label: "Agentes & Projetos", icon: <Bot size={17} /> },
  { id: "limits", label: "Limites & Sessões", icon: <Gauge size={17} /> },
  { id: "orbit", label: "ORBIT Engine", icon: <OrbitIcon size={17} /> },
  { id: "quality", label: "Qualidade", icon: <BadgeCheck size={17} /> },
  { id: "reports", label: "Relatórios", icon: <FileText size={17} /> },
  { id: "billing", label: "Faturamento", icon: <CreditCard size={17} /> },
  { id: "settings", label: "Configurações", icon: <Settings2 size={17} /> },
];

export const TITLES: Record<Section, string> = Object.fromEntries(NAV.map((n) => [n.id, n.label])) as Record<Section, string>;

/** Connector to scroll to / open inside Integrações (from a `maindy://integrations/<kind>` link). */
export type Focus = { connector: ConnectorKind; nonce: number } | null;

export function MainWindow({ initialSection = "overview", initialPeriod = "7d", initialFocus = null }: { initialSection?: Section; initialPeriod?: Period; initialFocus?: ConnectorKind | null }) {
  const { boot, demo } = useApp();
  const [section, setSection] = useState<Section>(initialSection);
  const [focus, setFocus] = useState<Focus>(initialFocus ? { connector: initialFocus, nonce: 1 } : null);

  useEffect(() => {
    const un = bridge().on<string>("maindy://navigate", (s) => {
      if (NAV.some((n) => n.id === s)) setSection(s as Section);
    });
    // maindy:// links: the Rust core validated the URL; we still accept only known sections
    const apply = (r: Route | null) => {
      if (!r || !NAV.some((n) => n.id === r.section)) return;
      setSection(r.section);
      setFocus(r.connector ? { connector: r.connector, nonce: Date.now() } : null);
    };
    const take = () => void bridge().routeTake().then(apply, () => {});
    take(); // cold start: the link may have arrived before this window was listening
    const unRoute = bridge().on("maindy://route", take);
    return () => {
      void un.then((u) => u());
      void unRoute.then((u) => u());
    };
  }, []);

  if ((!boot.paired || boot.sessionRevoked) && !demo) {
    return (
      <div className={cx("app", `platform-${boot.platform}`)}>
        <div className="titlebar-drag" data-tauri-drag-region />
        <Pairing />
      </div>
    );
  }
  return (
    <div className={cx("app", "shell", `platform-${boot.platform}`)}>
      <Sidebar section={section} onSelect={setSection} />
      <Content section={section} setSection={setSection} initialPeriod={initialPeriod} demo={demo} focus={focus} />
    </div>
  );
}

function Sidebar({ section, onSelect }: { section: Section; onSelect: (s: Section) => void }) {
  const { gateway, boot } = useApp();
  return (
    <aside className="sidebar">
      <div className="sidebar-top" data-tauri-drag-region>
        <Wordmark height={22} />
      </div>
      <nav aria-label="Seções">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={cx("nav-item", section === n.id && "active")}
            aria-current={section === n.id ? "page" : undefined}
            onClick={() => onSelect(n.id)}
          >
            <span className="nav-icon" aria-hidden>
              {n.icon}
            </span>
            <span>{n.label}</span>
            {n.external && <ExternalLink size={12} className="nav-ext" aria-label="abre no navegador" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button type="button" className="gw-chip" onClick={() => onSelect("settings")}>
          <StatusDot tone={gateway.healthy ? "ok" : gateway.phase === "crashed" ? "error" : "idle"} />
          <span>{gatewayLabel(gateway)}</span>
        </button>
        <span className="sidebar-ver">
          v{boot.version} · {boot.platform === "macos" ? "macOS" : boot.platform === "windows" ? "Windows" : "Linux"}
        </span>
      </div>
    </aside>
  );
}

function Content({ section, setSection, initialPeriod, demo, focus }: { section: Section; setSection: (s: Section) => void; initialPeriod: Period; demo: boolean; focus: Focus }) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const d = useDashboard(period);
  const { gateway } = useApp();
  const status = orbitStatus(d.policy.data, gateway);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showPeriod = ["overview", "savings", "projects", "quality"].includes(section);

  const togglePause = async () => {
    setBusy(true);
    try {
      if (demo) {
        d.setDemoPaused(status !== "paused");
        setToast(status === "paused" ? "ORBIT retomado (demonstração)." : "ORBIT pausado (demonstração).");
      } else {
        const r = status === "paused" ? await bridge().orbitResume() : await bridge().orbitPause();
        setToast(r.messages[0] ?? (r.paused ? "ORBIT pausado." : "ORBIT retomado."));
        await d.reload();
      }
    } catch (e) {
      setToast(errorMessage(e));
    } finally {
      setBusy(false);
      window.setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <main className="content">
      <header className="topbar" data-tauri-drag-region>
        <div className="topbar-title" data-tauri-drag-region>
          <h1>{TITLES[section]}</h1>
          {d.updatedAt && <span className="updated">Atualizado {ago(d.updatedAt.toISOString())}</span>}
        </div>
        <div className="topbar-actions">
          {showPeriod && (
            <div className="seg" role="radiogroup" aria-label="Período">
              {(["24h", "7d", "30d"] as Period[]).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={period === p} className={cx(period === p && "on")} onClick={() => setPeriod(p)}>
                  {p === "24h" ? "24 h" : p === "7d" ? "7 dias" : "30 dias"}
                </button>
              ))}
            </div>
          )}
          <span className={cx("chip", `chip-${status}`)}>
            <StatusDot tone={status === "active" ? "violet" : status === "paused" ? "warn" : "idle"} />
            {orbitStatusLabel[status]}
          </span>
          <button type="button" className={cx("btn", status === "paused" ? "btn-primary" : "btn-ghost")} onClick={() => void togglePause()} disabled={busy}>
            {status === "paused" ? <Play size={15} aria-hidden /> : <Pause size={15} aria-hidden />}
            {status === "paused" ? "Retomar ORBIT" : "Pausar ORBIT"}
          </button>
        </div>
      </header>
      {demo && <DemoBanner />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <div className="content-body">
        {section === "overview" && <Overview d={d} period={period} go={setSection} />}
        {section === "savings" && <Savings d={d} period={period} />}
        {section === "integrations" && <Integrations d={d} focus={focus} />}
        {section === "projects" && <Projects d={d} period={period} />}
        {section === "limits" && <Limits d={d} go={setSection} />}
        {section === "orbit" && <OrbitEngine d={d} />}
        {section === "quality" && <Quality d={d} period={period} />}
        {section === "reports" && <Reports />}
        {section === "billing" && <Billing d={d} />}
        {section === "settings" && <SettingsSection />}
      </div>
    </main>
  );
}
