/**
 * Metadata-only JSON-lines logger. By construction it only accepts a whitelisted set of scalar fields —
 * there is no way to pass a request body, header map or credential through it.
 */
import { appendFileSync, renameSync, statSync } from "node:fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  route?: string;
  method?: string;
  status?: number;
  ms?: number;
  upstream?: string;
  model?: string;
  cache?: string;
  eventId?: string;
  mode?: string;
  count?: number;
  code?: string;
  port?: number;
  version?: string;
  home?: string;
  detail?: string;
}

const ALLOWED = new Set<keyof LogFields>(["route", "method", "status", "ms", "upstream", "model", "cache", "eventId", "mode", "count", "code", "port", "version", "home", "detail"]);
const MAX_LOG_BYTES = 5 * 1024 * 1024;

export class Logger {
  constructor(private readonly file: string | null, private readonly toStdout = true, private readonly minLevel: LogLevel = "info") {}

  log(level: LogLevel, msg: string, fields: LogFields = {}): void {
    const order = { debug: 0, info: 1, warn: 2, error: 3 };
    if (order[level] < order[this.minLevel]) return;
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!ALLOWED.has(k as keyof LogFields) || v === undefined) continue;
      safe[k] = typeof v === "string" ? v.slice(0, 200) : v;
    }
    const line = JSON.stringify({ t: new Date().toISOString(), lvl: level, msg: msg.slice(0, 200), ...safe });
    if (this.toStdout) process.stdout.write(`${line}\n`);
    if (this.file) {
      try {
        try {
          if (statSync(this.file).size > MAX_LOG_BYTES) renameSync(this.file, `${this.file}.1`);
        } catch {
          /* first write */
        }
        appendFileSync(this.file, `${line}\n`, { mode: 0o600 });
      } catch {
        /* logging must never break the gateway */
      }
    }
  }
  info(msg: string, f?: LogFields) {
    this.log("info", msg, f);
  }
  warn(msg: string, f?: LogFields) {
    this.log("warn", msg, f);
  }
  error(msg: string, f?: LogFields) {
    this.log("error", msg, f);
  }
  debug(msg: string, f?: LogFields) {
    this.log("debug", msg, f);
  }
}
