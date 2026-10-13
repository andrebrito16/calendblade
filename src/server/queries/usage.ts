import "server-only";
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { countConnections, countRules } from "@/server/billing/entitlements";
import { trialAlreadyUsed } from "@/server/billing/trial";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/schema";

export type Usage = { calendars: number; rules: number; trialAvailable: boolean };

async function getUsageByUserId(userId: string): Promise<Usage> {
  "use cache";
  cacheTag(tags.connections(userId), tags.rules(userId), tags.billing(userId));
  cacheLife("minutes");
  const owner = await db.query.user.findFirst({ where: eq(userTable.id, userId), columns: { email: true } });
  const [calendars, rules, trialUsed] = await Promise.all([
    countConnections(userId),
    countRules(userId),
    owner ? trialAlreadyUsed(owner.email) : Promise.resolve(false),
  ]);
  return { calendars, rules, trialAvailable: !trialUsed };
}

/**
 * Usage against plan limits, for display. Cached and invalidated by the
 * connection/rule/billing tags; Server Actions enforce limits with fresh
 * counts (assertCanAddCalendar/assertCanAddRule).
 */
export async function getUsage() {
  const user = await getCurrentUser();
  return getUsageByUserId(user.id);
}
