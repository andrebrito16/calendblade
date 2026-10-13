import type { Plan } from "@/lib/plans";

type PricingT = (key: string, values?: Record<string, number>) => string;

/** Feature bullets per plan, from the plan catalogue. */
export function planFeatures(plan: Plan, t: PricingT) {
  return [
    t("calendars", { count: plan.maxCalendars }),
    Number.isFinite(plan.maxRules) ? t("rules", { count: plan.maxRules }) : t("unlimitedRules"),
    t("featureModes"),
    t("featureTwoWay"),
    t("featurePush"),
    t("featureFilters"),
  ];
}
