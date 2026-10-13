import "server-only";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { calendar } from "@/server/db/schema";
import type { ProviderCalendar } from "@/server/providers/types";

/**
 * Upserts the provider's calendar list. Calendars that disappeared are
 * removed unless a rule still references them (the sync engine then flags
 * that rule), so a rule is never deleted silently.
 */
export async function upsertCalendars(connectionId: string, calendars: ProviderCalendar[]) {
  for (const entry of calendars) {
    await db
      .insert(calendar)
      .values({
        connectionId,
        providerCalendarId: entry.id,
        name: entry.name,
        color: entry.color ?? null,
        timezone: entry.timezone ?? null,
        accessRole: entry.accessRole,
        isPrimary: entry.isPrimary,
      })
      .onConflictDoUpdate({
        target: [calendar.connectionId, calendar.providerCalendarId],
        set: {
          name: entry.name,
          color: entry.color ?? null,
          timezone: entry.timezone ?? null,
          accessRole: entry.accessRole,
          isPrimary: entry.isPrimary,
          updatedAt: new Date(),
        },
      });
  }

  const present = calendars.map((entry) => entry.id);
  // Raw, fully qualified SQL: unqualified refs would bind to sync_rule inside the subquery.
  const used = sql`exists (select 1 from "sync_rule" r where r."source_calendar_id" = "calendar"."id" or r."target_calendar_id" = "calendar"."id")`;
  await db
    .delete(calendar)
    .where(
      and(
        eq(calendar.connectionId, connectionId),
        present.length > 0 ? notInArray(calendar.providerCalendarId, present) : undefined,
        sql`not ${used}`,
      ),
    );
}
