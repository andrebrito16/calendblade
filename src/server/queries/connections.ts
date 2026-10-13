import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendar, calendarConnection } from "@/server/db/schema";

export type ConnectionSummary = {
  id: string;
  provider: "google" | "fixture";
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "active" | "needs_reauth" | "revoked";
  createdAt: Date;
  calendarCount: number;
};

async function listConnectionsByUserId(userId: string): Promise<ConnectionSummary[]> {
  "use cache";
  cacheTag(tags.connections(userId));
  cacheLife("minutes");
  return db
    .select({
      id: calendarConnection.id,
      provider: calendarConnection.provider,
      email: calendarConnection.email,
      displayName: calendarConnection.displayName,
      avatarUrl: calendarConnection.avatarUrl,
      status: calendarConnection.status,
      createdAt: calendarConnection.createdAt,
      // Raw, fully qualified SQL: Drizzle renders column refs unqualified in
      // correlated subqueries, which would bind them to the inner table.
      calendarCount: sql<number>`(select count(*)::int from "calendar" c where c."connection_id" = "calendar_connection"."id")`,
    })
    .from(calendarConnection)
    .where(and(eq(calendarConnection.userId, userId), ne(calendarConnection.status, "revoked")))
    .orderBy(asc(calendarConnection.createdAt));
}

export async function getConnections() {
  const user = await getCurrentUser();
  return listConnectionsByUserId(user.id);
}

export type CalendarDetail = {
  id: string;
  name: string;
  color: string | null;
  accessRole: string;
  isPrimary: boolean;
  isHidden: boolean;
  watchExpiresAt: Date | null;
  ruleCount: number;
};

async function getConnectionByIds(userId: string, connectionId: string) {
  "use cache";
  cacheTag(tags.connections(userId), tags.calendars(connectionId));
  cacheLife("minutes");
  const connection = await db.query.calendarConnection.findFirst({
    where: and(
      eq(calendarConnection.id, connectionId),
      eq(calendarConnection.userId, userId),
      ne(calendarConnection.status, "revoked"),
    ),
    columns: {
      id: true,
      provider: true,
      email: true,
      displayName: true,
      avatarUrl: true,
      status: true,
      createdAt: true,
      lastErrorCode: true,
    },
  });
  if (!connection) return null;
  const calendars: CalendarDetail[] = await db
    .select({
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      accessRole: calendar.accessRole,
      isPrimary: calendar.isPrimary,
      isHidden: calendar.isHidden,
      watchExpiresAt: calendar.watchExpiresAt,
      ruleCount: sql<number>`(select count(*)::int from "sync_rule" r where r."source_calendar_id" = "calendar"."id" or r."target_calendar_id" = "calendar"."id")`,
    })
    .from(calendar)
    .where(eq(calendar.connectionId, connectionId))
    .orderBy(sql`${calendar.isPrimary} desc`, asc(calendar.name));
  return { connection, calendars };
}

export async function getConnection(connectionId: string) {
  const user = await getCurrentUser();
  return getConnectionByIds(user.id, connectionId);
}

export type CalendarOption = {
  id: string;
  name: string;
  color: string | null;
  writable: boolean;
};

export type AccountOption = {
  id: string;
  email: string;
  status: "active" | "needs_reauth" | "revoked";
  calendars: CalendarOption[];
};

async function listCalendarOptionsByUserId(userId: string): Promise<AccountOption[]> {
  "use cache";
  cacheTag(tags.connections(userId));
  cacheLife("minutes");
  const rows = await db.query.calendarConnection.findMany({
    where: and(eq(calendarConnection.userId, userId), ne(calendarConnection.status, "revoked")),
    orderBy: asc(calendarConnection.createdAt),
    with: {
      calendars: {
        where: eq(calendar.isHidden, false),
        orderBy: [sql`${calendar.isPrimary} desc`, asc(calendar.name)],
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    status: row.status,
    calendars: row.calendars.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      writable: entry.accessRole === "owner" || entry.accessRole === "writer",
    })),
  }));
}

/** Accounts and their visible calendars for the rule form pickers. */
export async function getCalendarOptions() {
  const user = await getCurrentUser();
  return listCalendarOptionsByUserId(user.id);
}
