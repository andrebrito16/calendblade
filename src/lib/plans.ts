/**
 * Plan catalogue: the single place prices and limits are defined. Used by the
 * pricing page, billing screen, entitlements and the Stripe plugin config.
 */
export type PlanId = "pro" | "max";

export type Plan = {
  id: PlanId;
  priceUsd: number;
  maxCalendars: number;
  /** `Number.POSITIVE_INFINITY` means unlimited. */
  maxRules: number;
};

export const TRIAL_DAYS = 7;
export const TRIAL_MAX_CALENDARS = 2;
export const PAST_DUE_GRACE_DAYS = 7;
export const PAUSED_DATA_RETENTION_DAYS = 30;

export const plans: Record<PlanId, Plan> = {
  pro: { id: "pro", priceUsd: 2.99, maxCalendars: 2, maxRules: 2 },
  max: {
    id: "max",
    priceUsd: 5.99,
    maxCalendars: 15,
    maxRules: Number.POSITIVE_INFINITY,
  },
};

export const planList: Plan[] = [plans.pro, plans.max];

export function isPlanId(value: unknown): value is PlanId {
  return value === "pro" || value === "max";
}
