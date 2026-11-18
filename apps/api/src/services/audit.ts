import type { DbOrTx } from "../db/client.js";
import { auditEvents } from "../db/schema.js";
import type { AuthContext } from "../context.js";

export interface AuditInput {
  orgId: string;
  action: string;
  actor?: AuthContext | { kind: "system" | "billing"; id?: string | null };
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipPrefix?: string | null;
}

export async function audit(db: DbOrTx, input: AuditInput): Promise<void> {
  const actor = input.actor;
  let actorType: "user" | "device" | "system" | "billing" = "system";
  let actorId: string | null = null;
  if (actor) {
    if (actor.kind === "web") {
      actorType = "user";
      actorId = actor.userId;
    } else if (actor.kind === "device") {
      actorType = "device";
      actorId = actor.deviceId;
    } else {
      actorType = actor.kind;
      actorId = actor.id ?? null;
    }
  }
  await db.insert(auditEvents).values({
    organizationId: input.orgId,
    actorType,
    actorId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
    ipPrefix: input.ipPrefix ?? null,
  });
}
