/**
 * Policy source of truth:
 *  - linked to cloud  → GET {api}/v1/orbit/policy (Bearer device token), cached in sqlite (survives offline)
 *  - local mode       → $MAINDY_HOME/policy.json (created with mode "observe" on first run)
 * /maindy/pause and /maindy/resume flip a LOCAL flag that applies immediately and overrides any policy
 * (fail-open: paused ⇒ pure passthrough + measurement). When linked we also tell the cloud, best effort.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { OrbitPolicyDto, type TechniqueName } from "@maindy/contracts";
import { defaultPolicy } from "@maindy/orbit-engine";
import type { GatewayDb } from "./db.js";
import { writePrivate, type HomePaths } from "./home.js";
import type { Logger } from "./logger.js";
import type { CloudLink } from "./telemetry.js";

export class PolicyManager {
  private local: OrbitPolicyDto;
  private localMtime = 0;
  private cloud: OrbitPolicyDto | null;
  private rollbacks: Set<TechniqueName>;

  constructor(
    private readonly paths: HomePaths,
    private readonly db: GatewayDb,
    private readonly link: () => CloudLink | null,
    private readonly log: Logger,
  ) {
    this.local = this.readLocal();
    this.cloud = db.getKv<OrbitPolicyDto>("policy.cloud");
    this.rollbacks = new Set(db.getKv<TechniqueName[]>("rollbacks.local") ?? []);
  }

  private readLocal(): OrbitPolicyDto {
    if (!existsSync(this.paths.policy)) {
      const p = defaultPolicy("observe");
      writePrivate(this.paths.policy, `${JSON.stringify(p, null, 2)}\n`);
      this.localMtime = statSync(this.paths.policy).mtimeMs;
      return p;
    }
    try {
      this.localMtime = statSync(this.paths.policy).mtimeMs;
      return OrbitPolicyDto.parse(JSON.parse(readFileSync(this.paths.policy, "utf8")));
    } catch {
      this.log.warn("policy.json inválido; usando modo observe", { code: "policy_invalid" });
      return defaultPolicy("observe");
    }
  }

  /** Re-read policy.json if it changed on disk (desktop edits it). */
  reloadLocalIfChanged(): void {
    try {
      const m = statSync(this.paths.policy).mtimeMs;
      if (m !== this.localMtime) this.local = this.readLocal();
    } catch {
      this.local = this.readLocal();
    }
  }

  get pausedLocally(): boolean {
    return this.db.getKv<boolean>("paused") === true;
  }

  current(): OrbitPolicyDto {
    const base = this.link() && this.cloud ? this.cloud : this.local;
    return this.pausedLocally ? { ...base, paused: true } : base;
  }

  localRollbacks(): ReadonlySet<TechniqueName> {
    return this.rollbacks;
  }

  addRollback(t: TechniqueName): void {
    this.rollbacks.add(t);
    this.db.setKv("rollbacks.local", [...this.rollbacks]);
  }

  clearRollback(t: TechniqueName): void {
    this.rollbacks.delete(t);
    this.db.setKv("rollbacks.local", [...this.rollbacks]);
  }

  setLocal(p: OrbitPolicyDto): OrbitPolicyDto {
    const next = OrbitPolicyDto.parse({ ...p, updatedAt: new Date().toISOString(), version: (this.local.version ?? 0) + 1 });
    writePrivate(this.paths.policy, `${JSON.stringify(next, null, 2)}\n`);
    this.local = next;
    this.localMtime = statSync(this.paths.policy).mtimeMs;
    return next;
  }

  pause(paused: boolean): void {
    this.db.setKv("paused", paused);
    const l = this.link();
    if (l) {
      void fetch(`${l.apiUrl}/v1/orbit/${paused ? "pause" : "resume"}`, {
        method: "POST",
        headers: { authorization: `Bearer ${l.token}`, "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(5000),
      }).catch(() => this.log.warn("falha ao propagar pausa para a nuvem", { code: "cloud_pause_failed" }));
    }
  }

  async refreshFromCloud(): Promise<boolean> {
    this.reloadLocalIfChanged();
    const l = this.link();
    if (!l) return false;
    try {
      const res = await fetch(`${l.apiUrl}/v1/orbit/policy`, {
        headers: { authorization: `Bearer ${l.token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        this.log.warn("política da nuvem indisponível", { status: res.status, code: "policy_fetch" });
        return false;
      }
      const parsed = OrbitPolicyDto.safeParse(await res.json());
      if (!parsed.success) {
        this.log.warn("política da nuvem inválida", { code: "policy_invalid" });
        return false;
      }
      this.cloud = parsed.data;
      this.db.setKv("policy.cloud", parsed.data);
      return true;
    } catch {
      this.log.warn("política da nuvem inacessível; mantendo cache", { code: "policy_offline" });
      return false;
    }
  }

  async reportRollback(technique: TechniqueName, reason: string): Promise<void> {
    const l = this.link();
    if (!l) return;
    try {
      await fetch(`${l.apiUrl}/v1/orbit/rollback`, {
        method: "POST",
        headers: { authorization: `Bearer ${l.token}`, "content-type": "application/json" },
        body: JSON.stringify({ technique, reason }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      this.log.warn("falha ao reportar rollback", { code: "rollback_report" });
    }
  }
}
