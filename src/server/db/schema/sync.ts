import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { calendar } from "./calendars";

export const syncMode = pgEnum("sync_mode", ["full", "busy"]);
export const ruleStatus = pgEnum("rule_status", ["active", "paused", "error", "deleting"]);
export const runTrigger = pgEnum("run_trigger", ["webhook", "cron", "manual", "initial"]);
export const runStatus = pgEnum("run_status", ["queued", "running", "succeeded", "failed", "skipped"]);
export const jobKind = pgEnum("job_kind", [
  "sync_rule",
  "full_resync_rule",
  "renew_watch",
  "teardown_rule",
  "teardown_connection",
]);
export const jobStatus = pgEnum("job_status", ["pending", "claimed", "done", "failed", "dead"]);

export const syncRule = pgTable(
  "sync_rule",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceCalendarId: uuid()
      .notNull()
      .references(() => calendar.id, { onDelete: "cascade" }),
    targetCalendarId: uuid()
      .notNull()
      .references(() => calendar.id, { onDelete: "cascade" }),
    mode: syncMode().notNull(),
    busyTitle: text(),
    titlePrefix: text(),
    colorId: text(),
    includeAllDay: boolean().notNull().default(true),
    includeDeclined: boolean().notNull().default(false),
    includeTentative: boolean().notNull().default(true),
    includePrivate: boolean().notNull().default(true),
    pastDays: integer().notNull().default(7),
    futureDays: integer().notNull().default(90),
    status: ruleStatus().notNull().default("active"),
    statusReason: text(),
    lastRunAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("sync_rule_distinct_calendars", sql`${table.sourceCalendarId} <> ${table.targetCalendarId}`),
    unique().on(table.sourceCalendarId, table.targetCalendarId),
    index().on(table.userId),
  ],
);

/** Maps an origin event to the mirror a rule created for it. */
export const eventMirror = pgTable(
  "event_mirror",
  {
    id: id(),
    ruleId: uuid()
      .notNull()
      .references(() => syncRule.id, { onDelete: "cascade" }),
    sourceEventId: text().notNull(),
    sourceIcalUid: text(),
    targetEventId: text().notNull(),
    sourceEtag: text(),
    contentHash: text().notNull(),
    sourceStart: timestamp({ withTimezone: true }),
    sourceEnd: timestamp({ withTimezone: true }),
    isRecurringMaster: boolean().notNull().default(false),
    /** Times the user deleted the mirror and we recreated it. */
    recreateCount: integer().notNull().default(0),
    lastRecreatedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [unique().on(table.ruleId, table.sourceEventId), index().on(table.ruleId, table.targetEventId)],
);

export const syncRun = pgTable(
  "sync_run",
  {
    id: id(),
    ruleId: uuid()
      .notNull()
      .references(() => syncRule.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    trigger: runTrigger().notNull(),
    status: runStatus().notNull().default("queued"),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    createdCount: integer().notNull().default(0),
    updatedCount: integer().notNull().default(0),
    deletedCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    errorCode: text(),
    errorMessage: text(),
  },
  (table) => [
    index().on(table.userId, table.startedAt.desc()),
    index().on(table.ruleId, table.startedAt.desc()),
  ],
);

/** Postgres-backed job queue, claimed with FOR UPDATE SKIP LOCKED. */
export const job = pgTable(
  "job",
  {
    id: id(),
    kind: jobKind().notNull(),
    dedupeKey: text(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    runAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: jobStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(5),
    lockedAt: timestamp({ withTimezone: true }),
    lockedBy: text(),
    lastError: text(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("job_dedupe_key_active").on(table.dedupeKey).where(sql`${table.status} = 'pending'`),
    index().on(table.status, table.runAt),
  ],
);
