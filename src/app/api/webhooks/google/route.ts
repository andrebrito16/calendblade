import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto/hmac";
import { db } from "@/server/db";
import { calendar } from "@/server/db/schema";
import { env } from "@/server/env";
import { processJobs } from "@/server/jobs/worker";
import { log } from "@/server/log";
import { scheduleSync, WEBHOOK_DEBOUNCE_MS } from "@/server/sync/schedule";
import { channelToken } from "@/server/sync/watches";

export const maxDuration = 300;

/**
 * Google Calendar push notifications. Verifies the channel token, marks the
 * calendar dirty and enqueues a debounced sync, then processes it right
 * after responding. The 5-minute sync cron remains the safety net.
 */
export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceId = request.headers.get("x-goog-resource-id");
  const token = request.headers.get("x-goog-channel-token") ?? "";
  const state = request.headers.get("x-goog-resource-state");
  if (!channelId || !resourceId) return new NextResponse(null, { status: 400 });

  const row = await db.query.calendar.findFirst({ where: eq(calendar.watchChannelId, channelId) });
  if (!row || row.watchResourceId !== resourceId || !safeEqual(token, channelToken(row.id))) {
    log.warn("webhook.unknown_channel", { channelId });
    // 200 so Google doesn't retry a channel we no longer care about.
    return new NextResponse(null, { status: 200 });
  }
  if (state === "sync") return new NextResponse(null, { status: 200 });

  await db.update(calendar).set({ lastChangedAt: new Date() }).where(eq(calendar.id, row.id));
  await scheduleSync(row.id, "webhook", WEBHOOK_DEBOUNCE_MS);
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, WEBHOOK_DEBOUNCE_MS + 500));
    await processJobs({ budgetMs: Math.min(env.CRON_BUDGET_MS, 45_000) });
  });
  return new NextResponse(null, { status: 200 });
}
