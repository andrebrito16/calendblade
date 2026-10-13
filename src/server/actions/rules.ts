"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { createRuleSchema, ruleOptionsSchema } from "@/lib/schemas/rule";
import { analytics } from "@/server/analytics/posthog";
import { requireUser } from "@/server/auth/session";
import { assertCanAddRule, getFreshEntitlements } from "@/server/billing/entitlements";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule } from "@/server/db/schema";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { jobKeys, processJobs } from "@/server/jobs/worker";
import { scheduleFullResync, scheduleSync, scheduleWatch } from "@/server/sync/schedule";
import { limitAction } from "./rate-limit";
import { ActionError, runAction } from "./result";

const idSchema = z.uuid();

/** Kick the queue right after responding, so syncs start within seconds. */
function processSoon() {
  after(() => processJobs({ budgetMs: Math.min(env.CRON_BUDGET_MS, 30_000) }));
}

function invalidateRules(userId: string, ruleId?: string) {
  updateTag(tags.rules(userId));
  updateTag(tags.connections(userId));
  updateTag(tags.runs(userId));
  if (ruleId) updateTag(tags.rule(ruleId));
}

async function ownedRule(userId: string, ruleId: string) {
  const rule = await db.query.syncRule.findFirst({
    where: and(eq(syncRule.id, idSchema.parse(ruleId)), eq(syncRule.userId, userId)),
  });
  if (!rule || rule.status === "deleting") throw new ActionError("not_found");
  return rule;
}

function toColumns(options: z.output<typeof ruleOptionsSchema>) {
  return {
    mode: options.mode,
    busyTitle: options.busyTitle || null,
    titlePrefix: options.titlePrefix || null,
    colorId: options.colorId || null,
    includeAllDay: options.includeAllDay,
    includeDeclined: options.includeDeclined,
    includeTentative: options.includeTentative,
    includePrivate: options.includePrivate,
    pastDays: options.pastDays,
    futureDays: options.futureDays,
  };
}

export async function createRule(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "rules.create", 20);
    const values = createRuleSchema.parse(input);
    await assertCanAddRule(user.id);

    const calendars = await db
      .select({
        id: calendar.id,
        accessRole: calendar.accessRole,
        connectionStatus: calendarConnection.status,
      })
      .from(calendar)
      .innerJoin(calendarConnection, eq(calendarConnection.id, calendar.connectionId))
      .where(
        and(
          inArray(calendar.id, [values.sourceCalendarId, values.targetCalendarId]),
          eq(calendarConnection.userId, user.id),
        ),
      );
    const source = calendars.find((entry) => entry.id === values.sourceCalendarId);
    const target = calendars.find((entry) => entry.id === values.targetCalendarId);
    if (!source || !target) throw new ActionError("not_found");
    if (target.accessRole !== "owner" && target.accessRole !== "writer") {
      throw new ActionError("forbidden");
    }

    const existing = await db.query.syncRule.findFirst({
      where: and(
        eq(syncRule.sourceCalendarId, values.sourceCalendarId),
        eq(syncRule.targetCalendarId, values.targetCalendarId),
      ),
    });
    if (existing) throw new ActionError("conflict");

    const [rule] = await db
      .insert(syncRule)
      .values({
        userId: user.id,
        sourceCalendarId: values.sourceCalendarId,
        targetCalendarId: values.targetCalendarId,
        ...toColumns(values),
      })
      .returning({ id: syncRule.id });
    if (!rule) throw new ActionError("unknown");

    await scheduleWatch(values.sourceCalendarId);
    await scheduleFullResync(values.sourceCalendarId, "initial");
    processSoon();
    analytics.capture(user.id, "rule_created", { mode: values.mode });
    invalidateRules(user.id, rule.id);
    return { id: rule.id };
  });
}

export async function updateRule(ruleId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "rules.update", 30);
    const rule = await ownedRule(user.id, ruleId);
    const values = ruleOptionsSchema.parse(input);
    await db.update(syncRule).set(toColumns(values)).where(eq(syncRule.id, rule.id));
    // Mode or filters changed: rewrite mirrors in place.
    if (rule.status === "active") {
      await scheduleFullResync(rule.sourceCalendarId, "manual");
      processSoon();
    }
    invalidateRules(user.id, rule.id);
    return { id: rule.id };
  });
}

export async function pauseRule(ruleId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "rules.toggle", 30);
    const rule = await ownedRule(user.id, ruleId);
    await db.update(syncRule).set({ status: "paused", statusReason: null }).where(eq(syncRule.id, rule.id));
    await scheduleWatch(rule.sourceCalendarId);
    processSoon();
    invalidateRules(user.id, rule.id);
    return undefined;
  });
}

export async function resumeRule(ruleId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "rules.toggle", 30);
    const rule = await ownedRule(user.id, ruleId);
    const entitlements = await getFreshEntitlements(user.id);
    if (entitlements.plan === "paused") throw new ActionError("paused");
    if (!entitlements.canSync) throw new ActionError("no_subscription");
    await db.update(syncRule).set({ status: "active", statusReason: null }).where(eq(syncRule.id, rule.id));
    await scheduleWatch(rule.sourceCalendarId);
    await scheduleSync(rule.sourceCalendarId, "manual");
    processSoon();
    invalidateRules(user.id, rule.id);
    return undefined;
  });
}

export async function runRuleNow(ruleId: string, opts: { full?: boolean } = {}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "rules.run", 12);
    const rule = await ownedRule(user.id, ruleId);
    if (rule.status === "paused") throw new ActionError("forbidden");
    if (rule.status === "error") {
      // "Sync now" on a failed rule is a retry.
      const entitlements = await getFreshEntitlements(user.id);
      if (!entitlements.canSync) throw new ActionError("no_subscription");
      await db.update(syncRule).set({ status: "active", statusReason: null }).where(eq(syncRule.id, rule.id));
    }
    if (opts.full) await scheduleFullResync(rule.sourceCalendarId, "manual");
    else await scheduleSync(rule.sourceCalendarId, "manual");
    processSoon();
    invalidateRules(user.id, rule.id);
    return undefined;
  });
}

export async function deleteRule(ruleId: string, opts: { deleteMirrors: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "rules.delete", 20);
    const rule = await ownedRule(user.id, ruleId);
    await db.update(syncRule).set({ status: "deleting" }).where(eq(syncRule.id, rule.id));
    await enqueue({
      kind: "teardown_rule",
      dedupeKey: jobKeys.teardownRule(rule.id),
      payload: { ruleId: rule.id, deleteMirrors: Boolean(opts.deleteMirrors) },
    });
    processSoon();
    invalidateRules(user.id, rule.id);
    return undefined;
  });
}
