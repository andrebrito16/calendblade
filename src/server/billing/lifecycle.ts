import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { publicEnv } from "@/lib/env.public";
import { PAUSED_DATA_RETENTION_DAYS } from "@/lib/plans";
import { analytics } from "@/server/analytics/posthog";
import { invalidateTags, tags } from "@/server/cache";
import { db } from "@/server/db";
import { syncRule, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { getServerFormatter } from "@/server/i18n/messages";
import { log } from "@/server/log";
import { scheduleSync, scheduleWatch } from "@/server/sync/schedule";
import { stopWatch } from "@/server/sync/watches";

export const SUBSCRIPTION_ENDED = "subscription_ended";
const DAY_MS = 24 * 60 * 60 * 1000;

export function dataDeletionDate(pausedAt: Date) {
  return new Date(pausedAt.getTime() + PAUSED_DATA_RETENTION_DAYS * DAY_MS);
}

/**
 * Subscription ended without renewal: pause every active rule, stop push
 * channels and start the 30-day retention clock. Mirrors stay in place.
 */
export async function pauseUser(userId: string) {
  const [owner] = await db
    .update(user)
    .set({ pausedAt: new Date() })
    .where(and(eq(user.id, userId), isNull(user.pausedAt)))
    .returning();
  if (!owner?.pausedAt) return;

  const paused = await db
    .update(syncRule)
    .set({ status: "paused", statusReason: SUBSCRIPTION_ENDED })
    .where(and(eq(syncRule.userId, userId), inArray(syncRule.status, ["active", "error"])))
    .returning({ sourceCalendarId: syncRule.sourceCalendarId });
  for (const calendarId of new Set(paused.map((rule) => rule.sourceCalendarId))) {
    await stopWatch(calendarId);
  }

  invalidateTags(tags.billing(userId), tags.rules(userId), tags.user(userId));
  analytics.capture(userId, "subscription_paused");
  const date = getServerFormatter(owner.locale, owner.timezone).dateTime(dataDeletionDate(owner.pausedAt), {
    dateStyle: "long",
  });
  await sendEmail({
    to: owner.email,
    template: "subscription-paused",
    props: { date, url: `${publicEnv.appUrl}/settings/billing` },
    locale: owner.locale,
    userId,
    idempotencyKey: `paused:${userId}:${owner.pausedAt.toISOString().slice(0, 10)}`,
  }).catch((error) => log.error("email.paused_failed", { error: String(error) }));
}

/** Resubscribed (within the retention window): resume rules and watches. */
export async function resumeUser(userId: string) {
  await db.update(user).set({ pausedAt: null }).where(eq(user.id, userId));
  const resumed = await db
    .update(syncRule)
    .set({ status: "active", statusReason: null })
    .where(
      and(
        eq(syncRule.userId, userId),
        eq(syncRule.status, "paused"),
        eq(syncRule.statusReason, SUBSCRIPTION_ENDED),
      ),
    )
    .returning({ sourceCalendarId: syncRule.sourceCalendarId });
  for (const calendarId of new Set(resumed.map((rule) => rule.sourceCalendarId))) {
    await scheduleWatch(calendarId);
    await scheduleSync(calendarId, "cron");
  }
  invalidateTags(tags.billing(userId), tags.rules(userId), tags.user(userId));
  if (resumed.length > 0) analytics.capture(userId, "subscription_resumed");
}
