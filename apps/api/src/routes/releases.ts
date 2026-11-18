import { ReleaseDto, ReleaseTarget } from "@maindy/contracts";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Config } from "../config.js";
import { downloadReleases } from "../db/schema.js";
import { notFound } from "../lib/errors.js";

export function toReleaseDto(config: Config, r: typeof downloadReleases.$inferSelect): ReleaseDto {
  const available = r.available && !!r.fileName && !!r.sha256 && r.sizeBytes !== null;
  return {
    target: r.target,
    version: r.version,
    available,
    url: available ? `${config.RELEASES_BASE_URL.replace(/\/$/, "")}/${r.target}/${encodeURIComponent(r.fileName!)}` : null,
    fileName: available ? r.fileName : null,
    sizeBytes: available ? r.sizeBytes : null,
    sha256: available ? r.sha256 : null,
    signing: r.signing,
    minOsVersion: r.minOsVersion,
    releasedAt: r.releasedAt?.toISOString() ?? null,
    changelog: r.changelog,
  };
}

const CONTENT_TYPES: Record<string, string> = {
  ".dmg": "application/x-apple-diskimage",
  ".zip": "application/zip",
  ".msi": "application/x-msi",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".gz": "application/gzip",
};

export const releaseRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config } = app.deps;

  app.get("/v1/releases", { schema: { tags: ["releases"], response: { 200: z.array(ReleaseDto) } } }, async () => {
    const rows = await db.select().from(downloadReleases).orderBy(asc(downloadReleases.target));
    return rows.map((r) => toReleaseDto(config, r));
  });

  /** Local release files (registered via src/scripts/register-release.ts). Only exact registered files are served. */
  app.get(
    "/releases/:target/:file",
    { schema: { hide: true, params: z.object({ target: ReleaseTarget, file: z.string().min(1).max(200) }) } },
    async (req, reply) => {
      const { target, file } = req.params;
      const [r] = await db.select().from(downloadReleases).where(and(eq(downloadReleases.target, target), eq(downloadReleases.available, true)));
      if (!r || !r.fileName || r.fileName !== file || basename(file) !== file) throw notFound("Arquivo não encontrado.");
      const root = resolve(config.releasesDirAbs);
      const path = resolve(join(root, target, file));
      if (!path.startsWith(root + sep)) throw notFound("Arquivo não encontrado.");
      const st = await stat(path).catch(() => null);
      if (!st?.isFile()) throw notFound("Arquivo não encontrado.");
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      const ascii = file.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
      return reply
        .header("content-type", CONTENT_TYPES[ext] ?? "application/octet-stream")
        .header("content-length", String(st.size))
        .header("content-disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file)}`)
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "public, max-age=300")
        .header("x-maindy-sha256", r.sha256 ?? "")
        .send(createReadStream(path));
    },
  );
};
