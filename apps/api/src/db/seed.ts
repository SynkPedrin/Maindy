import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { buildConfig, loadEnvFiles } from "../config.js";
import { createDb, type Db } from "./client.js";
import { downloadReleases, plans } from "./schema.js";
import { PLAN_SEEDS, RELEASE_SEEDS } from "./seed-data.js";

/**
 * Idempotent seed: plans (upsert commercial fields, keep Stripe price ids) and release rows
 * (insert-only — never clobbers a registered real build). No demo users or tenant data.
 */
export async function seed(db: Db): Promise<void> {
  for (const p of PLAN_SEEDS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          name: p.name,
          tagline: p.tagline,
          priceMonthlyCents: p.priceMonthlyCents,
          priceYearlyCents: p.priceYearlyCents,
          priceIsStartingAt: p.priceIsStartingAt,
          currency: p.currency,
          provisional: p.provisional,
          trialDays: p.trialDays,
          limits: p.limits,
          features: p.features,
          highlighted: p.highlighted,
          sortOrder: p.sortOrder,
          updatedAt: sql`now()`,
        },
      });
  }
  for (const r of RELEASE_SEEDS) {
    await db.insert(downloadReleases).values(r).onConflictDoNothing({ target: downloadReleases.target });
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]).replace(/\.ts$/, "") === resolve(import.meta.filename).replace(/\.ts$/, "");
if (isMain) {
  loadEnvFiles();
  const config = buildConfig();
  const url = process.argv.includes("--test") ? config.TEST_DATABASE_URL : config.DATABASE_URL;
  const h = createDb(url, { max: 1 });
  seed(h.db)
    .then(() => console.log(`seed ok (${PLAN_SEEDS.length} plans, ${RELEASE_SEEDS.length} release targets)`))
    .catch((err) => {
      console.error("seed failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => h.close());
}
