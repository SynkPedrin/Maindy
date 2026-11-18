// Types for installer.mjs (consumed by apps/gateway, which bundles this module).
export declare const DEFAULT_ENDPOINT: string;
export declare const STATUSLINE_MARKER: string;
export declare const HOOK_MARKER: string;
export declare function isOurStatusLine(sl: unknown): boolean;
export declare function isOurHook(h: unknown): boolean;
export declare function desiredEnv(endpoint: string): Record<string, string>;
export declare function statusLineCommand(binDir?: string | null): string;
export declare function hookCommand(binDir?: string | null): string;

export interface InstallerPaths {
  home: string;
  settingsPath: string;
  statePath: string;
  maindyHome: string;
}
export interface InstallerOptions {
  home?: string;
  maindyHome?: string;
  env?: Record<string, string | undefined>;
  endpoint?: string;
  dryRun?: boolean;
  forceStatusline?: boolean;
  binDir?: string;
  commands?: { statusLine?: string; hook?: string };
}
export interface InstallerResult {
  changed: boolean;
  dryRun: boolean;
  messages: string[];
  settings: Record<string, unknown> | null;
  backupPath: string | null;
  paths: InstallerPaths;
}
export declare function resolvePaths(opts?: InstallerOptions): InstallerPaths;
export declare function install(opts?: InstallerOptions): InstallerResult;
export declare function uninstall(opts?: InstallerOptions): InstallerResult;
export declare function status(opts?: InstallerOptions): {
  settingsExists: boolean;
  otel: boolean;
  env: Record<string, unknown>;
  statusLine: boolean;
  foreignStatusLine: boolean;
  hook: boolean;
  gatewayModeEnv: string | null;
  stateFile: boolean;
  paths: InstallerPaths;
};
export declare class InstallerError extends Error {
  exitCode: number;
}
