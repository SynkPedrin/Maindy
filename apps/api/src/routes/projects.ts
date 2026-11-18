import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { assertCanAdd } from "../billing/limits.js";
import { agents, projects } from "../db/schema.js";
import { conflict, notFound } from "../lib/errors.js";
import { ipPrefix } from "../lib/ip.js";
import { anyAuth } from "../plugins/auth.js";
import { audit } from "../services/audit.js";

/** Same key that the gateway sends as `x-maindy-project` / `x-maindy-agent`. */
const Key = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/, "Use letras, números, ponto, hífen ou sublinhado (até 120).");

export const ProjectDto = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const AgentDto = ProjectDto.extend({ projectId: z.string().nullable() });

const ProjectCreate = z.object({ key: Key, name: z.string().trim().min(1).max(120), description: z.string().max(500).nullable().optional() });
const ProjectPatch = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(500).nullable().optional() });
const AgentCreate = ProjectCreate.extend({ projectId: z.string().uuid().nullable().optional() });
const AgentPatch = ProjectPatch.extend({ projectId: z.string().uuid().nullable().optional() });
const IdParams = z.object({ id: z.string().uuid() });

const toProject = (p: typeof projects.$inferSelect) => ({
  id: p.id,
  key: p.key,
  name: p.name,
  description: p.description,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
const toAgent = (a: typeof agents.$inferSelect) => ({ ...toProject(a as unknown as typeof projects.$inferSelect), projectId: a.projectId });

const isUnique = (err: unknown) =>
  typeof err === "object" && err !== null && ((err as { code?: string }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505");

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;
  // device tokens (desktop app) are org-scoped and allowed too; roles apply to web sessions
  const writers = { auth: "any" as const, roles: ["owner" as const, "admin" as const, "member" as const] };

  /* ------------------------------ projects ------------------------------ */
  app.get("/projects", { config: { auth: "any" }, schema: { tags: ["projects"], response: { 200: z.array(ProjectDto) } } }, async (req) => {
    const rows = await db.select().from(projects).where(eq(projects.organizationId, anyAuth(req).orgId)).orderBy(asc(projects.name));
    return rows.map(toProject);
  });

  app.post("/projects", { config: writers, schema: { tags: ["projects"], body: ProjectCreate, response: { 201: ProjectDto } } }, async (req, reply) => {
    const a = anyAuth(req);
    await assertCanAdd(db, a.orgId, "projects");
    try {
      const [p] = await db
        .insert(projects)
        .values({ organizationId: a.orgId, key: req.body.key, name: req.body.name, description: req.body.description ?? null })
        .returning();
      await audit(db, { orgId: a.orgId, actor: a, action: "project.created", targetType: "project", targetId: p!.id, metadata: { key: p!.key }, ipPrefix: ipPrefix(req.ip) });
      return reply.status(201).send(toProject(p!));
    } catch (err) {
      if (isUnique(err)) throw conflict("key_taken", "Já existe um projeto com esta chave.");
      throw err;
    }
  });

  app.patch("/projects/:id", { config: writers, schema: { tags: ["projects"], params: IdParams, body: ProjectPatch, response: { 200: ProjectDto } } }, async (req) => {
    const a = anyAuth(req);
    const [p] = await db
      .update(projects)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(projects.id, req.params.id), eq(projects.organizationId, a.orgId)))
      .returning();
    if (!p) throw notFound("Projeto não encontrado.");
    await audit(db, { orgId: a.orgId, actor: a, action: "project.updated", targetType: "project", targetId: p.id, ipPrefix: ipPrefix(req.ip) });
    return toProject(p);
  });

  app.delete("/projects/:id", { config: writers, schema: { tags: ["projects"], params: IdParams, response: { 200: z.object({ ok: z.literal(true) }) } } }, async (req) => {
    const a = anyAuth(req);
    const rows = await db.delete(projects).where(and(eq(projects.id, req.params.id), eq(projects.organizationId, a.orgId))).returning({ id: projects.id });
    if (!rows.length) throw notFound("Projeto não encontrado.");
    await audit(db, { orgId: a.orgId, actor: a, action: "project.deleted", targetType: "project", targetId: req.params.id, ipPrefix: ipPrefix(req.ip) });
    return { ok: true as const };
  });

  /* ------------------------------ agents ------------------------------ */
  const assertProjectInOrg = async (orgId: string, projectId: string | null | undefined) => {
    if (!projectId) return;
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));
    if (!p) throw notFound("Projeto não encontrado.");
  };

  app.get("/agents", { config: { auth: "any" }, schema: { tags: ["projects"], response: { 200: z.array(AgentDto) } } }, async (req) => {
    const rows = await db.select().from(agents).where(eq(agents.organizationId, anyAuth(req).orgId)).orderBy(asc(agents.name));
    return rows.map(toAgent);
  });

  app.post("/agents", { config: writers, schema: { tags: ["projects"], body: AgentCreate, response: { 201: AgentDto } } }, async (req, reply) => {
    const a = anyAuth(req);
    await assertProjectInOrg(a.orgId, req.body.projectId);
    try {
      const [ag] = await db
        .insert(agents)
        .values({ organizationId: a.orgId, projectId: req.body.projectId ?? null, key: req.body.key, name: req.body.name, description: req.body.description ?? null })
        .returning();
      await audit(db, { orgId: a.orgId, actor: a, action: "agent.created", targetType: "agent", targetId: ag!.id, metadata: { key: ag!.key }, ipPrefix: ipPrefix(req.ip) });
      return reply.status(201).send(toAgent(ag!));
    } catch (err) {
      if (isUnique(err)) throw conflict("key_taken", "Já existe um agente com esta chave.");
      throw err;
    }
  });

  app.patch("/agents/:id", { config: writers, schema: { tags: ["projects"], params: IdParams, body: AgentPatch, response: { 200: AgentDto } } }, async (req) => {
    const a = anyAuth(req);
    await assertProjectInOrg(a.orgId, req.body.projectId);
    const [ag] = await db
      .update(agents)
      .set({ ...req.body, updatedAt: new Date() })
      .where(and(eq(agents.id, req.params.id), eq(agents.organizationId, a.orgId)))
      .returning();
    if (!ag) throw notFound("Agente não encontrado.");
    await audit(db, { orgId: a.orgId, actor: a, action: "agent.updated", targetType: "agent", targetId: ag.id, ipPrefix: ipPrefix(req.ip) });
    return toAgent(ag);
  });

  app.delete("/agents/:id", { config: writers, schema: { tags: ["projects"], params: IdParams, response: { 200: z.object({ ok: z.literal(true) }) } } }, async (req) => {
    const a = anyAuth(req);
    const rows = await db.delete(agents).where(and(eq(agents.id, req.params.id), eq(agents.organizationId, a.orgId))).returning({ id: agents.id });
    if (!rows.length) throw notFound("Agente não encontrado.");
    await audit(db, { orgId: a.orgId, actor: a, action: "agent.deleted", targetType: "agent", targetId: req.params.id, ipPrefix: ipPrefix(req.ip) });
    return { ok: true as const };
  });
};
