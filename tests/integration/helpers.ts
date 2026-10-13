import { and, eq, sql } from "drizzle-orm";
import { upsertCalendars } from "@/server/connections/calendars";
import { connectionCtx } from "@/server/connections/context";
import { encryptToken } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule, user } from "@/server/db/schema";
import { fixtureProvider } from "@/server/providers/fixture/adapter";
import { calendarState, resetFixtureState } from "@/server/providers/fixture/store";
import type { NormalizedEvent } from "@/server/providers/types";

export const NOW = new Date("2026-10-13T12:00:00Z");

export async function resetAll() {
  await db.execute(
    sql`truncate table "event_mirror", "sync_run", "sync_rule", "calendar", "calendar_connection", "job", "email_log", "session", "account", "user" cascade`,
  );
  resetFixtureState(NOW);
}

export async function createUser(email = "alex@example.com") {
  const [row] = await db.insert(user).values({ name: "Alex", email, timezone: "UTC" }).returning();
  if (!row) throw new Error("user not created");
  return row;
}

/** Connects a fixture account the way the OAuth callback does. */
export async function connectFixture(userId: string, accountId: string) {
  const tokens = await fixtureProvider.exchangeCode(accountId, "http://localhost/callback");
  const [connection] = await db
    .insert(calendarConnection)
    .values({
      userId,
      provider: "fixture",
      providerAccountId: tokens.account.id,
      email: tokens.account.email,
      accessTokenEnc: encryptToken(tokens.accessToken),
      refreshTokenEnc: encryptToken(tokens.refreshToken ?? ""),
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scopes: tokens.scopes,
    })
    .returning();
  if (!connection) throw new Error("connection not created");
  await upsertCalendars(connection.id, await fixtureProvider.listCalendars(connectionCtx(connection)));
  return connection;
}

export async function calendarId(connectionId: string, providerCalendarId: string) {
  const row = await db.query.calendar.findFirst({
    where: and(eq(calendar.connectionId, connectionId), eq(calendar.providerCalendarId, providerCalendarId)),
  });
  if (!row) throw new Error(`calendar ${providerCalendarId} not found`);
  return row.id;
}

export async function createRule(
  userId: string,
  sourceCalendarId: string,
  targetCalendarId: string,
  overrides: Partial<typeof syncRule.$inferInsert> = {},
) {
  const [row] = await db
    .insert(syncRule)
    .values({ userId, sourceCalendarId, targetCalendarId, mode: "busy", ...overrides })
    .returning();
  if (!row) throw new Error("rule not created");
  return row;
}

/** Live (non-cancelled) events in a fixture calendar. */
export function liveEvents(accountId: string, providerCalendarId: string): NormalizedEvent[] {
  const state = calendarState(accountId, providerCalendarId);
  return [...(state?.events.values() ?? [])]
    .map((entry) => entry.event)
    .filter((event) => event.status !== "cancelled");
}

export function mirrorsOf(accountId: string, providerCalendarId: string, ruleId?: string) {
  return liveEvents(accountId, providerCalendarId).filter(
    (event) => event.origin && (!ruleId || event.origin.ruleId === ruleId),
  );
}

export function writeCount(accountId: string, providerCalendarId: string) {
  return calendarState(accountId, providerCalendarId)?.seq ?? 0;
}
