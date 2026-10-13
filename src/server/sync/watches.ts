import "server-only";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { publicEnv } from "@/lib/env.public";
import { invalidateTags, tags } from "@/server/cache";
import { connectionCtx } from "@/server/connections/context";
import { hmac } from "@/server/crypto/hmac";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule, user } from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { getProvider } from "@/server/providers/registry";

const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

export function webhookUrl() {
  return `${publicEnv.appUrl}/api/webhooks/google`;
}

/** Channel token: HMAC of our calendar id, verified by the webhook route. */
export function channelToken(calendarId: string) {
  return hmac(env.WEBHOOK_SECRET, `watch:${calendarId}`);
}

async function loadCalendar(calendarId: string) {
  return db.query.calendar.findFirst({
    where: eq(calendar.id, calendarId),
    with: { connection: true },
  });
}

async function needsWatch(calendarId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncRule)
    .innerJoin(user, eq(user.id, syncRule.userId))
    .where(
      and(eq(syncRule.sourceCalendarId, calendarId), eq(syncRule.status, "active"), isNull(user.pausedAt)),
    );
  return (row?.count ?? 0) > 0;
}

export async function stopWatch(calendarId: string) {
  const row = await loadCalendar(calendarId);
  if (!row?.watchChannelId || !row.watchResourceId) return;
  try {
    if (row.connection.status !== "needs_reauth") {
      await getProvider(row.connection.provider).unsubscribe(connectionCtx(row.connection), {
        channelId: row.watchChannelId,
        resourceId: row.watchResourceId,
        expiresAt: row.watchExpiresAt ?? new Date(),
      });
    }
  } catch (error) {
    log.warn("watch.stop_failed", { calendarId, error: String(error) });
  }
  await db
    .update(calendar)
    .set({ watchChannelId: null, watchResourceId: null, watchExpiresAt: null })
    .where(eq(calendar.id, calendarId));
}

/**
 * Brings a calendar's push channel in line with its rules: created when an
 * active rule reads from it, renewed within 24h of expiry, stopped otherwise.
 * Google requires a public HTTPS address; without one the instance relies on
 * the sync cron.
 */
export async function reconcileWatch(calendarId: string, { force = false } = {}) {
  const row = await loadCalendar(calendarId);
  if (!row) return "missing" as const;
  if (!(await needsWatch(calendarId)) || row.connection.status !== "active") {
    await stopWatch(calendarId);
    return "stopped" as const;
  }
  const expiresSoon = !row.watchExpiresAt || row.watchExpiresAt.getTime() - Date.now() < RENEW_BEFORE_MS;
  if (row.watchChannelId && !expiresSoon && !force) return "ok" as const;

  const provider = getProvider(row.connection.provider);
  if (provider.id === "google" && !webhookUrl().startsWith("https://")) {
    log.info("watch.skipped_no_https", { calendarId });
    return "skipped" as const;
  }
  await stopWatch(calendarId);
  const watch = await provider.subscribe(
    connectionCtx(row.connection),
    row.providerCalendarId,
    webhookUrl(),
    channelToken(row.id),
  );
  await db
    .update(calendar)
    .set({
      watchChannelId: watch.channelId,
      watchResourceId: watch.resourceId,
      watchExpiresAt: watch.expiresAt,
    })
    .where(eq(calendar.id, calendarId));
  invalidateTags(tags.calendars(row.connectionId));
  return "renewed" as const;
}

/** Calendars whose channel expires within 24h, or that need one and lack it. */
export async function calendarsNeedingWatchRenewal() {
  const rows = await db
    .selectDistinct({ id: calendar.id })
    .from(calendar)
    .innerJoin(calendarConnection, eq(calendarConnection.id, calendar.connectionId))
    .innerJoin(syncRule, eq(syncRule.sourceCalendarId, calendar.id))
    .where(
      and(
        eq(calendarConnection.status, "active"),
        eq(syncRule.status, "active"),
        or(
          isNull(calendar.watchExpiresAt),
          lt(calendar.watchExpiresAt, new Date(Date.now() + RENEW_BEFORE_MS)),
        ),
      ),
    );
  return rows.map((row) => row.id);
}
