import "server-only";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { getUsage } from "./usage";

export async function getBillingOverview() {
  const user = await getCurrentUser();
  const [entitlements, usage] = await Promise.all([getEntitlements(user.id), getUsage()]);
  return {
    user,
    entitlements,
    usage: { calendars: usage.calendars, rules: usage.rules },
    trialAvailable: usage.trialAvailable,
  };
}
