import { resolve } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { API_ROOT, buildConfig, loadEnvFiles } from "../config.js";
import { createDb } from "./client.js";

export const MIGRATIONS_DIR = resolve(API_ROOT, "drizzle");

export async function runMigrations(url: string): Promise<void> {
  const handle = createDb(url, { max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await handle.close();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]).replace(/\.ts$/, "") === resolve(import.meta.filename).replace(/\.ts$/, "");
if (isMain) {
  loadEnvFiles();
  const config = buildConfig();
  const target = process.argv.includes("--test") ? config.TEST_DATABASE_URL : config.DATABASE_URL;
  runMigrations(target)
    .then(() => {
      console.log(`migrations applied (${new URL(target).pathname.slice(1)})`);
    })
    .catch((err) => {
      console.error("migration failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
