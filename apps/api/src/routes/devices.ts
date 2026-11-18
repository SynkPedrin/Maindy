import { DeviceDto, PairPollRequest, PairPollResponse, PairStartRequest, PairStartResponse } from "@maindy/contracts";
import { and, desc, eq, gt } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assertCanAdd } from "../billing/limits.js";
import { devicePairings, devices } from "../db/schema.js";
import { generateUserCode, normalizeUserCode, randomToken, sha256Hex } from "../lib/crypto.js";
import { ApiHttpError, badRequest, notFound } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { LIMITS } from "../lib/rate-limiter.js";
import { webAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";
import { markOnboarding } from "../services/onboarding.js";

export const PAIRING_TTL_SECONDS = 600;
export const PAIRING_POLL_INTERVAL_SECONDS = 3;

export const PairingDetailsDto = z.object({
  userCode: z.string(),
  deviceName: z.string(),
  platform: z.enum(["macos", "windows", "linux"]),
  arch: z.enum(["arm64", "x64"]),
  appVersion: z.string(),
  status: z.enum(["pending", "approved", "denied", "consumed", "expired"]),
  requestIpPrefix: z.string().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export function toDeviceDto(d: typeof devices.$inferSelect): DeviceDto {
  return {
    id: d.id,
    name: d.name,
    platform: d.platform,
    arch: d.arch,
    appVersion: d.appVersion,
    createdAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    revoked: d.revokedAt !== null,
  };
}

export const deviceRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, limiter, config } = app.deps;

  app.post(
    "/devices/pair/start",
    { schema: { tags: ["devices"], body: PairStartRequest, response: { 200: PairStartResponse } } },
    async (req) => {
      limiter.hit(`pairstart:ip:${req.ip}`, LIMITS.pairStartPerIp.max, LIMITS.pairStartPerIp.windowMs);
      limiter.hit("pairstart:global", LIMITS.pairStartGlobal.max, LIMITS.pairStartGlobal.windowMs);
      const deviceCode = randomToken(32);
      const now = new Date();
      let userCode = "";
      for (let i = 0; i < 6; i++) {
        const candidate = generateUserCode();
        const clash = await db
          .select({ id: devicePairings.id })
          .from(devicePairings)
          .where(and(eq(devicePairings.userCode, candidate), gt(devicePairings.expiresAt, now)));
        if (clash.length === 0) {
          userCode = candidate;
          break;
        }
      }
      if (!userCode) throw new ApiHttpError(503, "pairing_unavailable", "Não foi possível gerar um código agora. Tente novamente.");
      await db.insert(devicePairings).values({
        deviceCodeHash: sha256Hex(deviceCode),
        userCode,
        deviceName: req.body.deviceName,
        platform: req.body.platform,
        arch: req.body.arch,
        appVersion: req.body.appVersion,
        requestIpPrefix: ipPrefix(req.ip),
        expiresAt: new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000),
      });
      const base = new URL("/app/dispositivos/parear", config.WEB_PUBLIC_URL);
      const complete = new URL(base);
      complete.searchParams.set("code", userCode);
      return {
        deviceCode,
        userCode,
        verificationUrl: base.toString(),
        verificationUrlComplete: complete.toString(),
        expiresIn: PAIRING_TTL_SECONDS,
        interval: PAIRING_POLL_INTERVAL_SECONDS,
      };
    },
  );

  app.post(
    "/devices/pair/poll",
    { schema: { tags: ["devices"], body: PairPollRequest, response: { 200: PairPollResponse } } },
    async (req) => {
      limiter.hit(`pairpoll:ip:${req.ip}`, LIMITS.pairPollPerIp.max, LIMITS.pairPollPerIp.windowMs);
      if (req.body.deviceCode.length > 200) throw badRequest("invalid_device_code", "Código de dispositivo inválido.");
      const hash = sha256Hex(req.body.deviceCode);
      return db.transaction(async (tx) => {
        const [p] = await tx.select().from(devicePairings).where(eq(devicePairings.deviceCodeHash, hash)).for("update");
        if (!p) throw badRequest("invalid_device_code", "Código de dispositivo inválido.");
        const now = new Date();
        if (p.status === "consumed") return { status: "expired" as const };
        if (p.status === "denied") return { status: "denied" as const };
        if (p.expiresAt <= now) return { status: "expired" as const };
        if (p.status === "pending") {
          await tx.update(devicePairings).set({ lastPolledAt: now }).where(eq(devicePairings.id, p.id));
          return { status: "pending" as const };
        }
        // approved → mint the device token exactly once
        const deviceToken = randomToken(32);
        const [device] = await tx
          .insert(devices)
          .values({
            organizationId: p.organizationId!,
            name: p.deviceName,
            platform: p.platform,
            arch: p.arch,
            appVersion: p.appVersion,
            tokenHash: sha256Hex(deviceToken),
            approvedByUserId: p.approvedByUserId,
            lastIpPrefix: ipPrefix(req.ip),
            lastSeenAt: now,
          })
          .returning();
        await tx.update(devicePairings).set({ status: "consumed", deviceId: device!.id, lastPolledAt: now }).where(eq(devicePairings.id, p.id));
        await markOnboarding(tx, p.organizationId!, ["device_paired"]);
        await audit(tx, {
          orgId: p.organizationId!,
          actor: { kind: "system" },
          action: "device.paired",
          targetType: "device",
          targetId: device!.id,
          metadata: { name: p.deviceName, platform: p.platform, arch: p.arch, appVersion: p.appVersion },
          ipPrefix: ipPrefix(req.ip),
        });
        return { status: "approved" as const, deviceToken, deviceId: device!.id, organizationId: p.organizationId! };
      });
    },
  );

  app.get(
    "/devices/pair/:userCode",
    { config: { auth: "web" }, schema: { tags: ["devices"], params: z.object({ userCode: z.string().max(20) }), response: { 200: PairingDetailsDto } } },
    async (req) => {
      const a = webAuth(req);
      const code = normalizeUserCode(req.params.userCode);
      if (!code) throw notFound("Código inválido ou expirado.");
      const [p] = await db.select().from(devicePairings).where(eq(devicePairings.userCode, code)).orderBy(desc(devicePairings.createdAt)).limit(1);
      if (!p || (p.organizationId && p.organizationId !== a.orgId)) throw notFound("Código inválido ou expirado.");
      const expired = p.status === "pending" && p.expiresAt <= new Date();
      return {
        userCode: p.userCode,
        deviceName: p.deviceName,
        platform: p.platform,
        arch: p.arch,
        appVersion: p.appVersion,
        status: expired ? ("expired" as const) : p.status,
        requestIpPrefix: p.requestIpPrefix,
        createdAt: p.createdAt.toISOString(),
        expiresAt: p.expiresAt.toISOString(),
      };
    },
  );

  app.post(
    "/devices/pair/approve",
    {
      config: { auth: "web", roles: ["owner", "admin", "member"] },
      schema: {
        tags: ["devices"],
        body: z.object({ userCode: z.string().max(20), approve: z.boolean() }),
        response: { 200: z.object({ status: z.enum(["approved", "denied"]) }) },
      },
    },
    async (req) => {
      const a = webAuth(req);
      const code = normalizeUserCode(req.body.userCode);
      if (!code) throw notFound("Código inválido ou expirado.");
      return db.transaction(async (tx) => {
        const [p] = await tx
          .select()
          .from(devicePairings)
          .where(and(eq(devicePairings.userCode, code), eq(devicePairings.status, "pending"), gt(devicePairings.expiresAt, new Date())))
          .for("update");
        if (!p) throw notFound("Código inválido ou expirado.");
        if (req.body.approve) await assertCanAdd(tx, a.orgId, "devices");
        const status = req.body.approve ? ("approved" as const) : ("denied" as const);
        await tx
          .update(devicePairings)
          .set({ status, organizationId: a.orgId, approvedByUserId: a.userId, decidedAt: new Date() })
          .where(eq(devicePairings.id, p.id));
        await audit(tx, {
          orgId: a.orgId,
          actor: a,
          action: req.body.approve ? "device.pairing_approved" : "device.pairing_denied",
          targetType: "device_pairing",
          targetId: p.id,
          metadata: { deviceName: p.deviceName, platform: p.platform },
          ipPrefix: ipPrefix(req.ip),
        });
        return { status };
      });
    },
  );

  app.get("/devices", { config: { auth: "web" }, schema: { tags: ["devices"], response: { 200: z.array(DeviceDto) } } }, async (req) => {
    const rows = await db.select().from(devices).where(eq(devices.organizationId, webAuth(req).orgId)).orderBy(desc(devices.createdAt));
    return rows.map(toDeviceDto);
  });

  app.delete(
    "/devices/:id",
    { config: { auth: "web" }, schema: { tags: ["devices"], params: z.object({ id: z.string().uuid() }), response: { 200: DeviceDto } } },
    async (req) => {
      const a = webAuth(req);
      const [d] = await db.select().from(devices).where(and(eq(devices.id, req.params.id), eq(devices.organizationId, a.orgId)));
      if (!d) throw notFound("Dispositivo não encontrado.");
      if (!(a.role === "owner" || a.role === "admin" || d.approvedByUserId === a.userId)) {
        throw new ApiHttpError(403, "forbidden", "Somente quem aprovou o dispositivo ou um administrador pode revogá-lo.");
      }
      const [updated] = await db
        .update(devices)
        .set({ revokedAt: d.revokedAt ?? new Date() })
        .where(and(eq(devices.id, d.id), eq(devices.organizationId, a.orgId)))
        .returning();
      if (!d.revokedAt) {
        await audit(db, { orgId: a.orgId, actor: a, action: "device.revoked", targetType: "device", targetId: d.id, ipPrefix: ipPrefix(req.ip) });
      }
      return toDeviceDto(updated!);
    },
  );
};

