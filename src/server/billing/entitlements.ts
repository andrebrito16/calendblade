import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendarConnection, subscription, syncRule } from "@/server/db/schema";
import { env } from "@/server/env";
import { type Entitlements, resolveEntitlements } from "./resolve";

export type { Entitlements } from "./resolve";

export class EntitlementError extends Error {
  constructor(readonly code: "no_subscription" | "calendar_limit" | "rule_limit" | "paused") {
    super(code);
    this.name = "EntitlementError";
  }
}

async function loadEntitlements(userId: string): Promise<Entitlements> {
  const rows = env.BILLING_ENABLED
    ? await db
        .select()
        .from(subscription)
        .where(eq(subscription.referenceId, userId))
        .orderBy(sql`${subscription.periodEnd} desc nulls last`)
    : [];
  return resolveEntitlements(rows, { billingEnabled: env.BILLING_ENABLED, now: new Date() });
}

/** Cached per user; invalidated with `billing:<userId>` by Stripe hooks. */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  "use cache";
  cacheTag(tags.billing(userId));
  cacheLife("minutes");
  return loadEntitlements(userId);
}

/** Uncached variant for writes, where a stale answer could let a limit slip. */
export async function getFreshEntitlements(userId: string) {
  return loadEntitlements(userId);
}

export async function countConnections(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(calendarConnection)
    .where(and(eq(calendarConnection.userId, userId), ne(calendarConnection.status, "revoked")));
  return row?.count ?? 0;
}

export async function countRules(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncRule)
    .where(and(eq(syncRule.userId, userId), ne(syncRule.status, "deleting")));
  return row?.count ?? 0;
}

function assertCanSync(entitlements: Entitlements) {
  if (entitlements.plan === "paused") throw new EntitlementError("paused");
  if (!entitlements.canSync) throw new EntitlementError("no_subscription");
}

/**
 * Each connected account counts as one "connected calendar" against the
 * plan limit (2 during the trial and on Pro, 15 on Max).
 */
export async function assertCanAddCalendar(userId: string) {
  const entitlements = await getFreshEntitlements(userId);
  assertCanSync(entitlements);
  if ((await countConnections(userId)) >= entitlements.maxCalendars) {
    throw new EntitlementError("calendar_limit");
  }
  return entitlements;
}

export async function assertCanAddRule(userId: string) {
  const entitlements = await getFreshEntitlements(userId);
  assertCanSync(entitlements);
  if ((await countRules(userId)) >= entitlements.maxRules) {
    throw new EntitlementError("rule_limit");
  }
  return entitlements;
}
