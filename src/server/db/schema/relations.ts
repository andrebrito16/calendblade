import { relations } from "drizzle-orm";
import { account, session, subscription, user } from "./auth";
import { calendar, calendarConnection } from "./calendars";
import { eventMirror, syncRule, syncRun } from "./sync";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  subscriptions: many(subscription),
  connections: many(calendarConnection),
  rules: many(syncRule),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, { fields: [subscription.referenceId], references: [user.id] }),
}));

export const connectionRelations = relations(calendarConnection, ({ one, many }) => ({
  user: one(user, {
    fields: [calendarConnection.userId],
    references: [user.id],
  }),
  calendars: many(calendar),
}));

export const calendarRelations = relations(calendar, ({ one, many }) => ({
  connection: one(calendarConnection, {
    fields: [calendar.connectionId],
    references: [calendarConnection.id],
  }),
  sourceRules: many(syncRule, { relationName: "source" }),
  targetRules: many(syncRule, { relationName: "target" }),
}));

export const syncRuleRelations = relations(syncRule, ({ one, many }) => ({
  user: one(user, { fields: [syncRule.userId], references: [user.id] }),
  source: one(calendar, {
    fields: [syncRule.sourceCalendarId],
    references: [calendar.id],
    relationName: "source",
  }),
  target: one(calendar, {
    fields: [syncRule.targetCalendarId],
    references: [calendar.id],
    relationName: "target",
  }),
  mirrors: many(eventMirror),
  runs: many(syncRun),
}));

export const eventMirrorRelations = relations(eventMirror, ({ one }) => ({
  rule: one(syncRule, {
    fields: [eventMirror.ruleId],
    references: [syncRule.id],
  }),
}));

export const syncRunRelations = relations(syncRun, ({ one }) => ({
  rule: one(syncRule, { fields: [syncRun.ruleId], references: [syncRule.id] }),
}));
