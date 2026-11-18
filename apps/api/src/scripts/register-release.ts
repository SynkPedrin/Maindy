/**
 * Registers a REAL local build as downloadable.
 *   pnpm --filter @maindy/api release:register <target> <file> <version> <signing> [--min-os "macOS 12"] [--changelog "item 1|item 2"]
 * Computes size + sha256, copies the file to RELEASES_DIR/<target>/<basename> (served at /releases/*) and marks it available.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ReleaseDto, ReleaseTarget } from "@maindy/contracts";
import { eq } from "drizzle-orm";
import { buildConfig, loadEnvFiles } from "../config.js";
import { createDb } from "../db/client.js";
import { downloadReleases } from "../db/schema.js";
import { RELEASE_SEEDS } from "../db/seed-data.js";

const Signing = ReleaseDto.shape.signing;

function sha256File(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(path)
      .on("data", (c) => h.update(c))
      .on("error", rej)
      .on("end", () => res(h.digest("hex")));
  });
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const [targetArg, fileArg, version, signingArg] = args;
  const usage = "usage: register-release <target> <file> <version> <signing> [--min-os X] [--changelog 'a|b']";
  const target = ReleaseTarget.safeParse(targetArg);
  const signing = Signing.safeParse(signingArg);
  if (!target.success || !fileArg || !version || !signing.success) {
    console.error(usage);
    console.error(`targets: ${ReleaseTarget.options.join(", ")}; signing: ${Signing.options.join(", ")}`);
    process.exit(2);
  }
  if (target.data.startsWith("windows") && signing.data !== "unsigned" && signing.data !== "authenticode") {
    console.error("windows builds can only be 'unsigned' or 'authenticode'");
    process.exit(2);
  }
  const src = resolve(fileArg);
  const st = await stat(src).catch(() => null);
  if (!st?.isFile()) {
    console.error(`file not found: ${src}`);
    process.exit(2);
  }
  loadEnvFiles();
  const config = buildConfig();
  const fileName = basename(src);
  const destDir = join(config.releasesDirAbs, target.data);
  await mkdir(destDir, { recursive: true });
  const sha256 = await sha256File(src);
  const dest = join(destDir, fileName);
  await copyFile(src, dest);
  const copied = await sha256File(dest);
  if (copied !== sha256) throw new Error("checksum mismatch after copy");

  const seedRow = RELEASE_SEEDS.find((r) => r.target === target.data)!;
  const changelog = flag(args, "--changelog")?.split("|").map((s) => s.trim()).filter(Boolean) ?? [];
  const values = {
    version,
    available: true,
    fileName,
    sizeBytes: st.size,
    sha256,
    signing: signing.data,
    minOsVersion: flag(args, "--min-os") ?? seedRow.minOsVersion,
    releasedAt: new Date(),
    changelog,
    updatedAt: new Date(),
  };
  const h = createDb(config.DATABASE_URL, { max: 1 });
  try {
    await h.db
      .insert(downloadReleases)
      .values({ target: target.data, ...values })
      .onConflictDoUpdate({ target: downloadReleases.target, set: values });
    const [row] = await h.db.select().from(downloadReleases).where(eq(downloadReleases.target, target.data));
    console.log(JSON.stringify({ target: row?.target, version: row?.version, fileName, sizeBytes: st.size, sha256, signing: signing.data, path: dest }, null, 2));
  } finally {
    await h.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
