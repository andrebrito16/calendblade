import { isPlanId, PAST_DUE_GRACE_DAYS, type PlanId, plans } from "@/lib/plans";

export type EntitlementPlan = "none" | "trial" | "pro" | "max" | "paused";

export type Entitlements = {
  billingEnabled: boolean;
  plan: EntitlementPlan;
  /** The paid plan chosen (also during the trial). */
  planId: PlanId | null;
  status: string | null;
  trialEndsAt: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  pastDue: boolean;
  stripeSubscriptionId: string | null;
  maxCalendars: number;
  maxRules: number;
  canSync: boolean;
};

export type SubscriptionSnapshot = {
  plan: string;
  status: string;
  stripeSubscriptionId: string | null;
  trialEnd: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const UNLIMITED = Number.POSITIVE_INFINITY;
const LIVE_STATUSES = ["trialing", "active", "past_due"];

/**
 * Pure entitlement resolution (fully unit-tested):
 * - billing disabled (self-host) → unlimited
 * - trialing → the chosen plan's limits
 * - active, or past_due within the 7-day grace → the plan's limits
 * - anything else → `paused` if they ever subscribed, `none` otherwise
 */
export function resolveEntitlements(
  subscriptions: SubscriptionSnapshot[],
  opts: { billingEnabled: boolean; now: Date },
): Entitlements {
  const base = {
    billingEnabled: opts.billingEnabled,
    planId: null,
    status: null,
    trialEndsAt: null,
    periodEnd: null,
    cancelAtPeriodEnd: false,
    pastDue: false,
    stripeSubscriptionId: null,
  };

  if (!opts.billingEnabled) {
    return { ...base, plan: "max", maxCalendars: UNLIMITED, maxRules: UNLIMITED, canSync: true };
  }

  const current = subscriptions.find((sub) => LIVE_STATUSES.includes(sub.status) && isPlanId(sub.plan));
  if (current && isPlanId(current.plan)) {
    const plan = plans[current.plan];
    const details = {
      ...base,
      planId: current.plan,
      status: current.status,
      trialEndsAt: current.trialEnd,
      periodEnd: current.periodEnd,
      cancelAtPeriodEnd: current.cancelAtPeriodEnd ?? false,
      stripeSubscriptionId: current.stripeSubscriptionId,
    };
    if (current.status === "trialing") {
      return {
        ...details,
        plan: "trial",
        maxCalendars: plan.maxCalendars,
        maxRules: plan.maxRules,
        canSync: true,
      };
    }
    const graceEnds = (current.periodEnd?.getTime() ?? 0) + PAST_DUE_GRACE_DAYS * DAY_MS;
    if (current.status === "active" || opts.now.getTime() <= graceEnds) {
      return {
        ...details,
        plan: current.plan,
        pastDue: current.status === "past_due",
        maxCalendars: plan.maxCalendars,
        maxRules: plan.maxRules,
        canSync: true,
      };
    }
  }

  const everSubscribed = subscriptions.some((sub) => sub.status !== "incomplete");
  return {
    ...base,
    plan: everSubscribed ? "paused" : "none",
    maxCalendars: 0,
    maxRules: 0,
    canSync: false,
  };
}

export function trialDaysLeft(trialEndsAt: Date | null, now: Date) {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}
