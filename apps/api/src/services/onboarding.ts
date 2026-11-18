import { OnboardingStep, type OnboardingDto } from "@maindy/contracts";
import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { onboardingProgress } from "../db/schema.js";

const ORDER = OnboardingStep.options;

export function toOnboardingDto(row: { completed: string[]; dismissed: boolean; updatedAt: Date }): OnboardingDto {
  const set = new Set(row.completed);
  return {
    completed: ORDER.filter((s) => set.has(s)),
    dismissed: row.dismissed,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOnboarding(db: DbOrTx, orgId: string): Promise<OnboardingDto> {
  const [row] = await db.select().from(onboardingProgress).where(eq(onboardingProgress.organizationId, orgId));
  if (!row) return { completed: [], dismissed: false, updatedAt: new Date(0).toISOString() };
  return toOnboardingDto(row);
}

/** Idempotently adds steps (set union, done in SQL to avoid lost updates). */
export async function markOnboarding(db: DbOrTx, orgId: string, steps: OnboardingStep[]): Promise<void> {
  if (steps.length === 0) return;
  const add = JSON.stringify(steps);
  await db
    .insert(onboardingProgress)
    .values({ organizationId: orgId, completed: steps })
    .onConflictDoUpdate({
      target: onboardingProgress.organizationId,
      set: {
        completed: sql`(select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from jsonb_array_elements_text(${onboardingProgress.completed} || ${add}::jsonb) as v)`,
        updatedAt: sql`now()`,
      },
    });
}
