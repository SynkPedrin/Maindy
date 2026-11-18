import { sql } from "drizzle-orm";
import { buildConfig, loadEnvFiles } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";

/** Fresh schema in maindy_test → migrations → seed (plans, release rows). */
export default async function setup() {
  loadEnvFiles();
  const config = buildConfig({ ...process.env, NODE_ENV: "test" });
  const url = config.TEST_DATABASE_URL;
  if (!/maindy_test/.test(url)) throw new Error(`refusing to reset non-test database: ${url}`);
  const h = createDb(url, { max: 1 });
  await h.db.execute(sql`drop schema if exists public cascade`);
  await h.db.execute(sql`drop schema if exists drizzle cascade`);
  await h.db.execute(sql`create schema public`);
  await h.close();
  await runMigrations(url);
  const h2 = createDb(url, { max: 1 });
  await seed(h2.db);
  await h2.close();
}
