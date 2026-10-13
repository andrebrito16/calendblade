import "server-only";
import Stripe from "stripe";
import { plans, TRIAL_DAYS } from "@/lib/plans";
import { env } from "@/server/env";

let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/** Plans registered with the Better Auth Stripe plugin, from src/lib/plans.ts. */
export function stripePlans() {
  return [
    {
      name: "pro",
      priceId: env.STRIPE_PRICE_PRO_MONTHLY ?? "",
      limits: { calendars: plans.pro.maxCalendars, rules: plans.pro.maxRules },
      freeTrial: { days: TRIAL_DAYS },
    },
    {
      name: "max",
      priceId: env.STRIPE_PRICE_MAX_MONTHLY ?? "",
      limits: { calendars: plans.max.maxCalendars, rules: -1 },
      freeTrial: { days: TRIAL_DAYS },
    },
  ];
}
