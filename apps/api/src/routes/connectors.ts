import { ConnectorDto, ConnectorKind, ConnectorStatus } from "@maindy/contracts";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CATALOG_BY_KIND, CONNECTOR_CATALOG, isValidCredentialRef } from "../connectors/catalog.js";
import { deriveStatus, loadEvidence, loadExplicitRows, loadPolicyState } from "../connectors/status.js";
import type { DbOrTx } from "../db/client.js";
import { connectors, integrationCredentialRefs } from "../db/schema.js";
import { unprocessable } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { anyAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { markOnboarding } from "../services/onboarding.js";

async function listConnectors(db: DbOrTx, orgId: string): Promise<ConnectorDto[]> {
  const [evidence, explicit, policy] = await Promise.all([loadEvidence(db, orgId), loadExplicitRows(db, orgId), loadPolicyState(db, orgId)]);
  return CONNECTOR_CATALOG.map((def) => {
    const ev = evidence.get(def.kind) ?? null;
    const row = explicit.get(def.kind) ?? null;
    return {
      kind: def.kind,
      name: def.name,
      description: def.description,
      capabilities: def.capabilities,
      limitations: def.limitations,
      // chat_apps has no API to observe: it can never be derived from traffic
      status: def.kind === "chat_apps" ? (row?.status ?? "not_connected") : deriveStatus(ev, row, policy),
      lastSyncAt: ev?.lastEventAt.toISOString() ?? null,
      credentialRef: row?.credentialRef ?? null,
    };
  });
}

export const connectorRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get("/connectors", { config: { auth: "any" }, schema: { tags: ["connectors"], response: { 200: z.array(ConnectorDto) } } }, async (req) =>
    listConnectors(db, anyAuth(req).orgId),
  );

  app.put(
    "/connectors/:kind",
    {
      config: { auth: "any", roles: ["owner", "admin"] },
      schema: {
        tags: ["connectors"],
        params: z.object({ kind: ConnectorKind }),
        body: z.object({ status: ConnectorStatus, credentialRef: z.string().max(220).nullable().optional() }),
        response: { 200: ConnectorDto },
      },
    },
    async (req) => {
      const a = anyAuth(req);
      const def = CATALOG_BY_KIND.get(req.params.kind)!;
      if (!def.allowedStatuses.includes(req.body.status)) {
        throw unprocessable("capability_not_supported", `${def.name}: este status não é suportado. ${def.limitations[0] ?? ""}`.trim(), {
          allowedStatuses: def.allowedStatuses,
        });
      }
      const ref = req.body.credentialRef;
      if (ref && !isValidCredentialRef(ref)) {
        throw unprocessable(
          "invalid_credential_ref",
          "Informe apenas a referência de onde o segredo está guardado (ex.: keychain:maindy/openai), nunca o segredo em si.",
        );
      }
      await db.transaction(async (tx) => {
        // lastSyncAt is derived from events now; null marks the row as explicit (see connectors/status.ts)
        const values = { status: req.body.status, updatedAt: new Date(), lastSyncAt: null, ...(ref !== undefined ? { credentialRef: ref } : {}) };
        await tx
          .insert(connectors)
          .values({ organizationId: a.orgId, kind: req.params.kind, status: req.body.status, credentialRef: ref ?? null })
          .onConflictDoUpdate({ target: [connectors.organizationId, connectors.kind], set: values });
        if (ref) {
          await tx
            .insert(integrationCredentialRefs)
            .values({ organizationId: a.orgId, connectorKind: req.params.kind, ref, deviceId: a.kind === "device" ? a.deviceId : null })
            .onConflictDoUpdate({
              target: [integrationCredentialRefs.organizationId, integrationCredentialRefs.connectorKind],
              set: { ref, updatedAt: new Date() },
            });
        } else if (ref === null) {
          await tx
            .delete(integrationCredentialRefs)
            .where(and(eq(integrationCredentialRefs.organizationId, a.orgId), eq(integrationCredentialRefs.connectorKind, req.params.kind)));
        }
        if (req.body.status === "connected_read_only" || req.body.status === "optimization_active") {
          await markOnboarding(tx, a.orgId, ["connector_added"]);
        }
        await audit(tx, {
          orgId: a.orgId,
          actor: a,
          action: "connector.updated",
          targetType: "connector",
          targetId: req.params.kind,
          metadata: { status: req.body.status, credentialRef: ref ?? null },
          ipPrefix: ipPrefix(req.ip),
        });
      });
      const list = await listConnectors(db, a.orgId);
      return list.find((c) => c.kind === req.params.kind)!;
    },
  );
};
