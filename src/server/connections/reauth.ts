import "server-only";
import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { publicEnv } from "@/lib/env.public";
import { invalidateTags, tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { log } from "@/server/log";

export const REAUTH_REASON = "connection_needs_reauth";

/**
 * Token refresh failed for good: flag the connection, pause every rule that
 * reads from or writes to it, and email the user once per incident.
 */
export async function markConnectionNeedsReauth(connectionId: string, code: string) {
  const [connection] = await db
    .update(calendarConnection)
    .set({ status: "needs_reauth", lastErrorCode: code, lastErrorAt: new Date() })
    .where(eq(calendarConnection.id, connectionId))
    .returning();
  if (!connection) return;

  const calendarIds = (
    await db.select({ id: calendar.id }).from(calendar).where(eq(calendar.connectionId, connectionId))
  ).map((row) => row.id);
  if (calendarIds.length > 0) {
    await db
      .update(syncRule)
      .set({ status: "paused", statusReason: REAUTH_REASON })
      .where(
        and(
          eq(syncRule.status, "active"),
          or(
            inArray(syncRule.sourceCalendarId, calendarIds),
            inArray(syncRule.targetCalendarId, calendarIds),
          ),
        ),
      );
  }

  // Push channels can't be renewed or stopped without a token; forget them
  // (Google lets them expire) and recreate after reconnecting.
  await db
    .update(calendar)
    .set({ watchChannelId: null, watchResourceId: null, watchExpiresAt: null })
    .where(eq(calendar.connectionId, connectionId));

  invalidateTags(
    tags.connections(connection.userId),
    tags.rules(connection.userId),
    tags.calendars(connectionId),
  );
  log.warn("connection.needs_reauth", { connectionId, code });

  if (connection.reauthEmailSentAt) return;
  const owner = await db.query.user.findFirst({ where: eq(user.id, connection.userId) });
  if (!owner || !owner.emailNotifications) return;
  await db
    .update(calendarConnection)
    .set({ reauthEmailSentAt: new Date() })
    .where(eq(calendarConnection.id, connectionId));
  await sendEmail({
    to: owner.email,
    template: "connection-needs-reauth",
    props: { email: connection.email, url: `${publicEnv.appUrl}/connections/${connection.id}` },
    locale: owner.locale,
    userId: owner.id,
  }).catch((error) => log.error("email.reauth_failed", { error: String(error) }));
}

/** After a successful reconnect: resume the rules paused for reauth. */
export async function resumeRulesAfterReauth(connectionId: string) {
  const calendarIds = (
    await db.select({ id: calendar.id }).from(calendar).where(eq(calendar.connectionId, connectionId))
  ).map((row) => row.id);
  if (calendarIds.length === 0) return [];
  const blockedCalendars = db
    .select({ id: calendar.id })
    .from(calendar)
    .innerJoin(calendarConnection, eq(calendar.connectionId, calendarConnection.id))
    .where(ne(calendarConnection.status, "active"));
  const resumed = await db
    .update(syncRule)
    .set({ status: "active", statusReason: null })
    .where(
      and(
        eq(syncRule.status, "paused"),
        eq(syncRule.statusReason, REAUTH_REASON),
        or(inArray(syncRule.sourceCalendarId, calendarIds), inArray(syncRule.targetCalendarId, calendarIds)),
        // Keep rules paused while their other side still needs reconnecting.
        notInArray(syncRule.sourceCalendarId, blockedCalendars),
        notInArray(syncRule.targetCalendarId, blockedCalendars),
      ),
    )
    .returning({ id: syncRule.id, sourceCalendarId: syncRule.sourceCalendarId });
  return resumed;
}
