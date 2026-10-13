import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendar, calendarConnection, job, syncRule, syncRun } from "@/server/db/schema";
import { requestNow } from "@/server/time";

const sourceCalendar = alias(calendar, "source_calendar");
const targetCalendar = alias(calendar, "target_calendar");

export const ACTIVITY_PAGE_SIZE = 25;
export const ACTIVITY_RANGES = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type ActivityRange = keyof typeof ACTIVITY_RANGES;
export type RunStatus = (typeof syncRun.$inferSelect)["status"];

export type ActivityFilters = {
  ruleId?: string;
  status?: RunStatus;
  range: ActivityRange;
  page: number;
};

export type ActivityRow = {
  id: string;
  ruleId: string;
  trigger: (typeof syncRun.$inferSelect)["trigger"];
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  skippedCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  sourceName: string | null;
  targetName: string | null;
};

function selectRuns() {
  return db
    .select({
      id: syncRun.id,
      ruleId: syncRun.ruleId,
      trigger: syncRun.trigger,
      status: syncRun.status,
      startedAt: syncRun.startedAt,
      finishedAt: syncRun.finishedAt,
      createdCount: syncRun.createdCount,
      updatedCount: syncRun.updatedCount,
      deletedCount: syncRun.deletedCount,
      skippedCount: syncRun.skippedCount,
      errorCode: syncRun.errorCode,
      errorMessage: syncRun.errorMessage,
      sourceName: sourceCalendar.name,
      targetName: targetCalendar.name,
    })
    .from(syncRun)
    .leftJoin(syncRule, eq(syncRule.id, syncRun.ruleId))
    .leftJoin(sourceCalendar, eq(sourceCalendar.id, syncRule.sourceCalendarId))
    .leftJoin(targetCalendar, eq(targetCalendar.id, syncRule.targetCalendarId));
}

/** Activity log: always fresh (request-time, no cache). */
export async function getActivity(filters: ActivityFilters) {
  const user = await getCurrentUser();
  const now = await requestNow();
  const since = new Date(now.getTime() - ACTIVITY_RANGES[filters.range] * 24 * 60 * 60 * 1000);
  const rows: ActivityRow[] = await selectRuns()
    .where(
      and(
        eq(syncRun.userId, user.id),
        gte(syncRun.startedAt, since),
        filters.ruleId ? eq(syncRun.ruleId, filters.ruleId) : undefined,
        filters.status ? eq(syncRun.status, filters.status) : undefined,
      ),
    )
    .orderBy(desc(syncRun.startedAt))
    .limit(ACTIVITY_PAGE_SIZE + 1)
    .offset((filters.page - 1) * ACTIVITY_PAGE_SIZE);
  return {
    rows: rows.slice(0, ACTIVITY_PAGE_SIZE),
    hasNext: rows.length > ACTIVITY_PAGE_SIZE,
  };
}

export type DashboardStats = {
  last24h: { created: number; updated: number; deleted: number; runs: number };
  recent: ActivityRow[];
};

async function getDashboardStatsByUserId(userId: string): Promise<DashboardStats> {
  "use cache";
  cacheTag(tags.runs(userId));
  cacheLife("seconds");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totals] = await db
    .select({
      created: sql<number>`coalesce(sum(${syncRun.createdCount}), 0)::int`,
      updated: sql<number>`coalesce(sum(${syncRun.updatedCount}), 0)::int`,
      deleted: sql<number>`coalesce(sum(${syncRun.deletedCount}), 0)::int`,
      runs: sql<number>`count(*)::int`,
    })
    .from(syncRun)
    .where(and(eq(syncRun.userId, userId), gte(syncRun.startedAt, since)));
  const recent = await selectRuns()
    .where(eq(syncRun.userId, userId))
    .orderBy(desc(syncRun.startedAt))
    .limit(8);
  return {
    last24h: totals ?? { created: 0, updated: 0, deleted: 0, runs: 0 },
    recent,
  };
}

export async function getDashboardStats() {
  const user = await getCurrentUser();
  return getDashboardStatsByUserId(user.id);
}

/** Jobs queued for this user's calendars (topbar sync indicator). */
export async function countPendingSyncsForUser(userId: string) {
  const calendarIds = db
    .select({ id: sql<string>`${calendar.id}::text` })
    .from(calendar)
    .innerJoin(calendarConnection, eq(calendarConnection.id, calendar.connectionId))
    .where(eq(calendarConnection.userId, userId));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(job)
    .where(
      and(
        inArray(job.status, ["pending", "claimed"]),
        inArray(job.kind, ["sync_rule", "full_resync_rule"]),
        inArray(sql`${job.payload}->>'calendarId'`, calendarIds),
      ),
    );
  return row?.count ?? 0;
}
