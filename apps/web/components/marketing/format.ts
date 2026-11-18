import type { PlanDto } from "@maindy/contracts";
import { PLAN_PRICE_FLOOR } from "./content";

export function formatPrice(cents: number, currency: string): string {
  const value = cents / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function isPriceFloor(plan: PlanDto): boolean {
  return Boolean(PLAN_PRICE_FLOOR[plan.code]);
}
