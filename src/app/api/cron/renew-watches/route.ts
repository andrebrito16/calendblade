import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/server/cron/auth";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { calendarsNeedingWatchRenewal, reconcileWatch } from "@/server/sync/watches";

export const maxDuration = 300;

/** Every 6 hours: renew push channels expiring within 24h, recreate missing ones. */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const startedAt = Date.now();
  const deadline = startedAt + env.CRON_BUDGET_MS - 5_000;

  const due = await calendarsNeedingWatchRenewal();
  let processed = 0;
  let failed = 0;
  for (const calendarId of due) {
    if (Date.now() > deadline) break;
    try {
      await reconcileWatch(calendarId);
      processed += 1;
    } catch (error) {
      failed += 1;
      log.error("watch.renew_failed", { calendarId, error: String(error) });
    }
  }
  return NextResponse.json({
    processed,
    failed,
    remaining: due.length - processed - failed,
    durationMs: Date.now() - startedAt,
  });
}
