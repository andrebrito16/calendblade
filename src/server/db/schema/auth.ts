import { bigint, boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

/**
 * Better Auth core tables (user, session, account, verification, rateLimit)
 * plus the Stripe plugin's `subscription`. Generated from the Better Auth
 * schema, then owned by us: uuid ids and Calendblade-specific user columns.
 */
export const user = pgTable("user", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  timezone: text().notNull().default("UTC"),
  locale: text().notNull().default("en"),
  emailNotifications: boolean().notNull().default(true),
  /** Cookie-consent choices mirrored on the account (proof of consent; server-side analytics). */
  consentErrors: boolean().notNull().default(false),
  consentAnalytics: boolean().notNull().default(false),
  consentUpdatedAt: timestamp({ withTimezone: true }),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  /** Set when the subscription ends; drives the 30-day data deletion. */
  pausedAt: timestamp({ withTimezone: true }),
  deletedAt: timestamp({ withTimezone: true }),
  stripeCustomerId: text(),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: id(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index().on(table.userId)],
);

/** Sign-in identities only. Calendar tokens live in `calendar_connection`. */
export const account = pgTable(
  "account",
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (table) => [index().on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index().on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/** Managed by the Better Auth Stripe plugin. The only source of trial state. */
export const subscription = pgTable(
  "subscription",
  {
    id: id(),
    plan: text().notNull(),
    referenceId: uuid().notNull(),
    stripeCustomerId: text(),
    stripeSubscriptionId: text(),
    status: text().notNull().default("incomplete"),
    periodStart: timestamp({ withTimezone: true }),
    periodEnd: timestamp({ withTimezone: true }),
    trialStart: timestamp({ withTimezone: true }),
    trialEnd: timestamp({ withTimezone: true }),
    cancelAtPeriodEnd: boolean().default(false),
    cancelAt: timestamp({ withTimezone: true }),
    canceledAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    seats: integer(),
    billingInterval: text(),
    stripeScheduleId: text(),
  },
  (table) => [index().on(table.referenceId)],
);
