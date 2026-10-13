import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { user } from "./auth";

/** Prevents a second trial after deleting and re-creating an account. */
export const trialUsedEmail = pgTable("trial_used_email", {
  emailHash: text().primaryKey(),
  usedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Idempotency log for lifecycle emails (one row per idempotency key). */
export const emailLog = pgTable("email_log", {
  id: id(),
  userId: uuid().references(() => user.id, { onDelete: "cascade" }),
  idempotencyKey: text().notNull().unique(),
  template: text().notNull(),
  sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
