// Types for installer.mjs (consumed by apps/gateway, which bundles this module).
export declare const BEGIN: string;
export declare const END: string;
export declare const DEFAULT_ENDPOINT: string;
export declare class CodexInstallerError extends Error {
  exitCode: number;
}
export interface CodexOptions {
  config?: string;
  home?: string;
  endpoint?: string;
  dryRun?: boolean;
}
export declare function resolveConfigPath(opts?: CodexOptions): string;
export declare function logsEndpoint(endpoint?: string): string;
export declare function managedBlock(endpoint?: string): string;
export declare function hasManaged(text: string): boolean;
export declare function findUnmanagedOtel(text: string): string | null;
export declare function install(opts?: CodexOptions): { path: string; changed: boolean; dryRun: boolean; backupPath: string | null; content: string; created: boolean };
export declare function uninstall(opts?: CodexOptions): { path: string; changed: boolean; dryRun: boolean; backupPath: string | null; content: string | null };
export declare function status(opts?: CodexOptions): { path: string; exists: boolean; installed: boolean; endpoint: string | null; unmanagedOtel: string | null };
