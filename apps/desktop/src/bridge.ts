/**
 * Bridge between the UI and the Rust core. In the Tauri app every call goes through `invoke`
 * (the device token never enters JS). In a plain browser (Vite preview, used only for visual QA
 * snapshots) a fixture bridge answers with clearly-labeled demo data.
 */
import type {
  AgentSetup,
  AgentTarget,
  Bootstrap,
  Route,
  CmdError,
  Entity,
  EntityBody,
  ExportView,
  GatewayUpstream,
  IntegrationApplyResult,
  IntegrationTool,
  OrbitPolicyDto,
  ProbeView,
  ProviderKeyView,
  PushReport,
  ReportPreview,
  StepsView,
  ToolIntegrations,
  UpstreamTestView,
  GatewayView,
  PairPollView,
  PairStartView,
  PauseResult,
  Settings,
  SettingsPatch,
  NotchState,
  View,
} from "./types";
import { fixtureBridge } from "./fixtures";

export type Unlisten = () => void;

export interface Bridge {
  isTauri: boolean;
  label: string;
  bootstrap(): Promise<Bootstrap>;
  pairStart(): Promise<PairStartView>;
  pairPoll(): Promise<PairPollView>;
  pairCancel(): Promise<void>;
  signOut(): Promise<void>;
  apiGet<T>(path: string, query?: Record<string, string>): Promise<T>;
  orbitUpdatePolicy<T>(policy: T): Promise<T>;
  orbitPause(): Promise<PauseResult>;
  orbitResume(): Promise<PauseResult>;
  gatewaySetEnabled(enabled: boolean): Promise<GatewayView>;
  settingsUpdate(patch: SettingsPatch): Promise<Settings>;
  autostartSet(enabled: boolean): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  openWeb(page: "billing" | "reports" | "devices" | "dashboard" | "integrations" | "projects" | "quality" | "signup"): Promise<void>;
  openMain(section?: string): Promise<void>;
  quit(): Promise<void>;
  notchSetState(state: NotchState): Promise<void>;
  notchSetBase(base: NotchState): Promise<void>;
  quickHide(): Promise<void>;
  pillSetExpanded(expanded: boolean): Promise<void>;
  startDragging(): Promise<void>;
  /** takes (and clears) the pending `maindy://` route, if any */
  routeTake(): Promise<Route | null>;
  on<T>(event: string, cb: (payload: T) => void): Promise<Unlisten>;
}

/** Operations behind the functional pages. In demo mode they are answered by labeled fixtures. */
export interface Ops {
  /** The only call that carries a secret into Rust; the key never comes back. */
  providerKeySave(id: string, apiKey: string): Promise<ProviderKeyView>;
  providerKeyDelete(id: string, connector: string | null): Promise<StepsView>;
  gatewayResync(): Promise<PushReport>;
  gatewayUpstreams(): Promise<{ upstreams: GatewayUpstream[] }>;
  gatewayUpstreamSetUrl(id: string, baseUrl: string): Promise<unknown>;
  gatewayUpstreamTest(id: string, connector: string | null): Promise<UpstreamTestView>;
  gatewayProbe(project?: string, agent?: string): Promise<ProbeView>;
  integrationsGet(): Promise<ToolIntegrations>;
  integrationApply(tool: IntegrationTool, action: "install" | "uninstall", dryRun: boolean, forceStatusline?: boolean): Promise<IntegrationApplyResult>;
  agentSetup(tool: IntegrationTool): Promise<AgentSetup>;
  /** Rust builds the URL from its own prompt and checks the scheme allowlist before opening it. */
  agentOpen(tool: IntegrationTool, target: AgentTarget): Promise<void>;
  reportPreview(from: string, to: string): Promise<ReportPreview>;
  reportExport(from: string, to: string, format: "csv" | "pdf", ask: boolean): Promise<ExportView>;
  revealPath(path: string): Promise<void>;
  entityCreate(entity: Entity, body: EntityBody): Promise<unknown>;
  entityUpdate(entity: Entity, id: string, body: EntityBody): Promise<unknown>;
  entityDelete(entity: Entity, id: string): Promise<unknown>;
  orbitPolicyPatch(patch: Record<string, unknown>): Promise<OrbitPolicyDto>;
  orbitRollback(technique: string, reason: string): Promise<OrbitPolicyDto>;
  orbitReactivate(technique: string): Promise<OrbitPolicyDto>;
}

export type FullBridge = Bridge & Ops;

export function isCmdError(e: unknown): e is CmdError {
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

export function errorMessage(e: unknown): string {
  if (isCmdError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return "Erro inesperado.";
}

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriBridge(): Promise<FullBridge> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  const toQuery = (q?: Record<string, string>) => (q ? Object.entries(q) : undefined);
  return {
    isTauri: true,
    label: win.label,
    bootstrap: () => invoke("bootstrap"),
    pairStart: () => invoke("pair_start"),
    pairPoll: () => invoke("pair_poll"),
    pairCancel: () => invoke("pair_cancel"),
    signOut: () => invoke("sign_out"),
    apiGet: (path, query) => invoke("api_get", { path, query: toQuery(query) }),
    orbitUpdatePolicy: (policy) => invoke("orbit_update_policy", { policy }),
    orbitPause: () => invoke("orbit_pause"),
    orbitResume: () => invoke("orbit_resume"),
    gatewaySetEnabled: (enabled) => invoke("gateway_set_enabled", { enabled }),
    settingsUpdate: (patch) => invoke("settings_update", { patch }),
    autostartSet: (enabled) => invoke("autostart_set", { enabled }),
    openExternal: (url) => invoke("open_external", { url }),
    openWeb: (page) => invoke("open_web", { page }),
    openMain: (section) => invoke("open_main", { section: section ?? null }),
    quit: () => invoke("quit_app"),
    notchSetState: (state) => invoke("notch_set_state", { state }),
    notchSetBase: (base) => invoke("notch_set_base", { base }),
    quickHide: () => invoke("quick_hide"),
    pillSetExpanded: (expanded) => invoke("pill_set_expanded", { expanded }),
    startDragging: () => win.startDragging(),
    routeTake: () => invoke("route_take"),
    on: async (event, cb) => {
      const un = await listen(event, (e) => cb(e.payload as never));
      return un;
    },
    providerKeySave: (id, apiKey) => invoke("provider_key_save", { id, apiKey }),
    providerKeyDelete: (id, connector) => invoke("provider_key_delete", { id, connector }),
    gatewayResync: () => invoke("gateway_resync"),
    gatewayUpstreams: () => invoke("gateway_upstreams"),
    gatewayUpstreamSetUrl: (id, baseUrl) => invoke("gateway_upstream_set_url", { id, baseUrl }),
    gatewayUpstreamTest: (id, connector) => invoke("gateway_upstream_test", { id, connector }),
    gatewayProbe: (project, agent) => invoke("gateway_probe", { project: project ?? null, agent: agent ?? null }),
    integrationsGet: () => invoke("integrations_get"),
    integrationApply: (tool, action, dryRun, forceStatusline) => invoke("integration_apply", { tool, action, dryRun, forceStatusline: forceStatusline ?? null }),
    agentSetup: (tool) => invoke("agent_setup", { tool }),
    agentOpen: (tool, target) => invoke("agent_open", { tool, target }),
    reportPreview: (from, to) => invoke("report_preview", { from, to }),
    reportExport: (from, to, format, ask) => invoke("report_export", { from, to, format, ask }),
    revealPath: (path) => invoke("reveal_path", { path }),
    entityCreate: (entity, body) => invoke("entity_create", { entity, body }),
    entityUpdate: (entity, id, body) => invoke("entity_update", { entity, id, body }),
    entityDelete: (entity, id) => invoke("entity_delete", { entity, id }),
    orbitPolicyPatch: (patch) => invoke("orbit_update_policy", { policy: patch }),
    orbitRollback: (technique, reason) => invoke("orbit_rollback", { technique, reason }),
    orbitReactivate: (technique) => invoke("orbit_reactivate", { technique }),
  };
}

let current: FullBridge | null = null;

export async function initBridge(): Promise<FullBridge> {
  if (current) return current;
  current = hasTauri() ? await tauriBridge() : fixtureBridge(new URLSearchParams(location.search));
  return current;
}

export function bridge(): FullBridge {
  if (!current) throw new Error("bridge not initialized");
  return current;
}

export function resolveView(b: Bridge): View {
  if (!b.isTauri) {
    const v = new URLSearchParams(location.search).get("view");
    return (v as View) || "snapshot";
  }
  if (b.label === "notch" || b.label === "quick" || b.label === "pill") return b.label;
  return "main";
}
