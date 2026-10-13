import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { calendar, calendarConnection } from "@/server/db/schema";
import { env } from "@/server/env";
import { processJobs } from "@/server/jobs/worker";
import {
  calendarState,
  expireSyncTokens,
  putEvent,
  resetFixtureState,
  restoreFixtureAccount,
  revokeFixtureAccount,
} from "@/server/providers/fixture/store";
import { scheduleSync } from "@/server/sync/schedule";

const bodySchema = z.object({
  action: z.enum(["create", "move", "rename", "cancel", "revoke", "restore", "expire-token", "reset"]),
  accountId: z.string().optional(),
  calendarId: z.string().optional(),
  eventId: z.string().optional(),
  title: z.string().optional(),
  startInHours: z.number().optional(),
  durationMinutes: z.number().optional(),
  /** Simulates a push notification: sync the calendar right away. */
  notify: z.boolean().optional(),
});

/**
 * Development/E2E only (PROVIDER_FIXTURE=1): mutates the in-memory fixture
 * calendars so sync behavior can be exercised without Google.
 */
export async function POST(request: Request) {
  if (!env.PROVIDER_FIXTURE) return new NextResponse(null, { status: 404 });
  const body = bodySchema.parse(await request.json());

  if (body.action === "reset") {
    resetFixtureState();
    return NextResponse.json({ ok: true });
  }
  const accountId = body.accountId ?? "fixture-work";
  if (body.action === "revoke") revokeFixtureAccount(accountId);
  if (body.action === "restore") restoreFixtureAccount(accountId);

  const calendarId = body.calendarId;
  if (calendarId) {
    const state = calendarState(accountId, calendarId);
    if (!state) return NextResponse.json({ error: "unknown_calendar" }, { status: 404 });
    const now = Date.now();
    const start = new Date(now + (body.startInHours ?? 24) * 3_600_000);
    const end = new Date(start.getTime() + (body.durationMinutes ?? 60) * 60_000);
    const existing = body.eventId ? state.events.get(body.eventId)?.event : undefined;

    if (body.action === "create") {
      putEvent(accountId, calendarId, {
        id: body.eventId ?? `dev${now.toString(36)}`,
        status: "confirmed",
        title: body.title ?? "New event",
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
        allDay: false,
        transparency: "opaque",
        visibility: "default",
        selfResponse: "accepted",
        attendees: [],
        organizerIsSelf: true,
        origin: null,
      });
    } else if (existing && body.action === "move") {
      putEvent(accountId, calendarId, {
        ...existing,
        start: { dateTime: start.toISOString(), timeZone: "UTC" },
        end: { dateTime: end.toISOString(), timeZone: "UTC" },
      });
    } else if (existing && body.action === "rename") {
      putEvent(accountId, calendarId, { ...existing, title: body.title ?? existing.title });
    } else if (existing && body.action === "cancel") {
      putEvent(accountId, calendarId, { ...existing, status: "cancelled" });
    } else if (body.action === "expire-token") {
      expireSyncTokens(accountId, calendarId);
    }

    if (body.notify) {
      const rows = await db
        .select({ id: calendar.id })
        .from(calendar)
        .innerJoin(calendarConnection, eq(calendarConnection.id, calendar.connectionId))
        .where(
          and(
            eq(calendar.providerCalendarId, calendarId),
            eq(calendarConnection.providerAccountId, accountId),
          ),
        );
      for (const row of rows) await scheduleSync(row.id, "webhook");
      const summary = await processJobs({ budgetMs: 30_000 });
      return NextResponse.json({ ok: true, summary });
    }
  }
  return NextResponse.json({ ok: true });
}
