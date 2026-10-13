import { boolean, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";

export const connectionProvider = pgEnum("connection_provider", ["google", "fixture"]);
export const connectionStatus = pgEnum("connection_status", ["active", "needs_reauth", "revoked"]);

/** One authorized provider account. Tokens are AES-256-GCM encrypted. */
export const calendarConnection = pgTable(
  "calendar_connection",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: connectionProvider().notNull(),
    providerAccountId: text().notNull(),
    email: text().notNull(),
    displayName: text(),
    avatarUrl: text(),
    accessTokenEnc: text(),
    refreshTokenEnc: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    scopes: text().array().notNull().default([]),
    status: connectionStatus().notNull().default("active"),
    lastErrorCode: text(),
    lastErrorAt: timestamp({ withTimezone: true }),
    reauthEmailSentAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [unique().on(table.userId, table.provider, table.providerAccountId), index().on(table.userId)],
);

/** A calendar discovered inside a connection. */
export const calendar = pgTable(
  "calendar",
  {
    id: id(),
    connectionId: uuid()
      .notNull()
      .references(() => calendarConnection.id, { onDelete: "cascade" }),
    providerCalendarId: text().notNull(),
    name: text().notNull(),
    color: text(),
    timezone: text(),
    accessRole: text().notNull(),
    isPrimary: boolean().notNull().default(false),
    isHidden: boolean().notNull().default(false),
    /** Incremental sync token, shared by every rule sourcing this calendar. */
    syncToken: text(),
    watchChannelId: text(),
    watchResourceId: text(),
    watchExpiresAt: timestamp({ withTimezone: true }),
    lastChangedAt: timestamp({ withTimezone: true }),
    /** Lease held while a worker syncs this source (one run per sync token). */
    syncLockedUntil: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.connectionId, table.providerCalendarId),
    index().on(table.watchExpiresAt),
    index().on(table.lastChangedAt),
    index().on(table.watchChannelId),
  ],
);
