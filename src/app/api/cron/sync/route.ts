import { and, eq, isNull, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/server/cron/auth";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule, user } from "@/server/db/schema";
import { env } from "@/server/env";
import { countPendingJobs } from "@/server/jobs/queue";
import { processJobs } from "@/server/jobs/worker";
import { scheduleSync } from "@/server/sync/schedule";

export const maxDuration = 300;

const SAFETY_NET_MS = 30 * 60 * 1000;

/**
 * Every 5 minutes: enqueue a sync for sources idle for 30+ minutes (safety
 * net for lost push notifications), then process due jobs within budget.
 */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const startedAt = Date.now();

  const idle = await db
    .selectDistinct({ calendarId: syncRule.sourceCalendarId })
    .from(syncRule)
    .innerJoin(user, eq(user.id, syncRule.userId))
    .innerJoin(calendar, eq(calendar.id, syncRule.sourceCalendarId))
    .innerJoin(calendarConnection, eq(calendarConnection.id, calendar.connectionId))
    .where(
      and(
        eq(syncRule.status, "active"),
        isNull(user.pausedAt),
        eq(calendarConnection.status, "active"),
        or(isNull(syncRule.lastRunAt), lt(syncRule.lastRunAt, new Date(Date.now() - SAFETY_NET_MS))),
      ),
    );
  for (const { calendarId } of idle) await scheduleSync(calendarId, "cron");

  const summary = await processJobs({ budgetMs: env.CRON_BUDGET_MS });
  return NextResponse.json({
    enqueued: idle.length,
    processed: summary.processed,
    failed: summary.failed,
    deferred: summary.deferred,
    remaining: await countPendingJobs(),
    durationMs: Date.now() - startedAt,
  });
}
