import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/server/cron/auth";
import { runHousekeeping } from "@/server/cron/housekeeping";
import { countPendingJobs } from "@/server/jobs/queue";

export const maxDuration = 300;

/** Daily 03:30 UTC: window advance, retention, paused-account deletion, stale claims. */
export async function GET(request: Request) {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) return unauthorized;
  const startedAt = Date.now();
  const result = await runHousekeeping();
  return NextResponse.json({
    ...result,
    processed: Object.values(result).reduce((sum, value) => sum + value, 0),
    remaining: await countPendingJobs(),
    durationMs: Date.now() - startedAt,
  });
}
