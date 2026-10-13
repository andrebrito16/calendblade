import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";
import { getCurrentUser } from "@/server/auth/session";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule, syncRun } from "@/server/db/schema";
import { countLiveMirrors } from "@/server/sync/run";

const sourceCalendar = alias(calendar, "source_calendar");
const targetCalendar = alias(calendar, "target_calendar");
const sourceConnection = alias(calendarConnection, "source_connection");
const targetConnection = alias(calendarConnection, "target_connection");

export type RuleSummary = {
  id: string;
  mode: "full" | "busy";
  status: "active" | "paused" | "error" | "deleting";
  statusReason: string | null;
  lastRunAt: Date | null;
  createdAt: Date;
  source: { id: string; name: string; color: string | null; email: string; connectionId: string };
  target: { id: string; name: string; color: string | null; email: string; connectionId: string };
};

function selectRules(userId: string, ruleId?: string) {
  return db
    .select({
      id: syncRule.id,
      mode: syncRule.mode,
      status: syncRule.status,
      statusReason: syncRule.statusReason,
      lastRunAt: syncRule.lastRunAt,
      createdAt: syncRule.createdAt,
      source: {
        id: sourceCalendar.id,
        name: sourceCalendar.name,
        color: sourceCalendar.color,
        email: sourceConnection.email,
        connectionId: sourceConnection.id,
      },
      target: {
        id: targetCalendar.id,
        name: targetCalendar.name,
        color: targetCalendar.color,
        email: targetConnection.email,
        connectionId: targetConnection.id,
      },
    })
    .from(syncRule)
    .innerJoin(sourceCalendar, eq(sourceCalendar.id, syncRule.sourceCalendarId))
    .innerJoin(targetCalendar, eq(targetCalendar.id, syncRule.targetCalendarId))
    .innerJoin(sourceConnection, eq(sourceConnection.id, sourceCalendar.connectionId))
    .innerJoin(targetConnection, eq(targetConnection.id, targetCalendar.connectionId))
    .where(and(eq(syncRule.userId, userId), ruleId ? eq(syncRule.id, ruleId) : undefined))
    .orderBy(desc(syncRule.createdAt));
}

async function listRulesByUserId(userId: string): Promise<RuleSummary[]> {
  "use cache";
  cacheTag(tags.rules(userId));
  cacheLife("minutes");
  return selectRules(userId);
}

export async function getRules() {
  const user = await getCurrentUser();
  return listRulesByUserId(user.id);
}

export type RuleDetail = RuleSummary & {
  settings: typeof syncRule.$inferSelect;
  mirrorCount: number;
};

async function getRuleByIds(userId: string, ruleId: string): Promise<RuleDetail | null> {
  "use cache";
  cacheTag(tags.rules(userId), tags.rule(ruleId));
  cacheLife("minutes");
  const [summary] = await selectRules(userId, ruleId);
  if (!summary) return null;
  const settings = await db.query.syncRule.findFirst({ where: eq(syncRule.id, ruleId) });
  if (!settings) return null;
  const counts = await countLiveMirrors([ruleId]);
  return { ...summary, settings, mirrorCount: counts.get(ruleId) ?? 0 };
}

export async function getRule(ruleId: string) {
  const user = await getCurrentUser();
  return getRuleByIds(user.id, ruleId);
}

export type RunRow = typeof syncRun.$inferSelect;

async function listRuleRunsByIds(userId: string, ruleId: string): Promise<RunRow[]> {
  "use cache";
  cacheTag(tags.runs(userId), tags.rule(ruleId));
  cacheLife("seconds");
  return db
    .select()
    .from(syncRun)
    .where(and(eq(syncRun.userId, userId), eq(syncRun.ruleId, ruleId)))
    .orderBy(desc(syncRun.startedAt))
    .limit(10);
}

export async function getRuleRuns(ruleId: string) {
  const user = await getCurrentUser();
  return listRuleRunsByIds(user.id, ruleId);
}
