import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { publicEnv } from "@/lib/env.public";
import { db } from "@/server/db";
import { syncRule, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { getServerTranslator } from "@/server/i18n/messages";
import { log } from "@/server/log";
import { isProviderError } from "@/server/providers/errors";
import { markRuleError, type RunTrigger, syncSourceCalendar } from "@/server/sync/run";
import { teardownConnection, teardownRule } from "@/server/sync/teardown";
import { reconcileWatch } from "@/server/sync/watches";
import { claimJobs, completeJob, deferJob, failJob, type Job } from "./queue";

const BATCH_SIZE = 3;
/** Leave room to finish the job in flight before the platform kills us. */
const SAFETY_MARGIN_MS = 5_000;

type Outcome = "done" | { defer: number };

async function resolveCalendarId(payload: Record<string, unknown>) {
  if (typeof payload.calendarId === "string") return payload.calendarId;
  if (typeof payload.ruleId === "string") {
    const rule = await db.query.syncRule.findFirst({ where: eq(syncRule.id, payload.ruleId) });
    return rule?.sourceCalendarId ?? null;
  }
  return null;
}

async function runJob(current: Job, deadline: number): Promise<Outcome> {
  const payload = current.payload;
  switch (current.kind) {
    case "sync_rule":
    case "full_resync_rule": {
      const calendarId = await resolveCalendarId(payload);
      if (!calendarId) return "done";
      const result = await syncSourceCalendar(calendarId, {
        trigger: (payload.trigger as RunTrigger | undefined) ?? "cron",
        full: current.kind === "full_resync_rule",
      });
      return result.status === "busy" ? { defer: 20_000 } : "done";
    }
    case "renew_watch": {
      if (typeof payload.calendarId === "string") {
        await reconcileWatch(payload.calendarId, { force: payload.force === true });
      }
      return "done";
    }
    case "teardown_rule": {
      const result = await teardownRule(String(payload.ruleId), {
        deleteMirrors: payload.deleteMirrors === true,
        keepRule: payload.keepRule === true,
        deadline,
      });
      return result === "partial" ? { defer: 1_000 } : "done";
    }
    case "teardown_connection": {
      const result = await teardownConnection(String(payload.connectionId), {
        deleteMirrors: payload.deleteMirrors === true,
        deadline,
      });
      return result === "partial" ? { defer: 1_000 } : "done";
    }
  }
}

/** A sync job died after all retries: mark its rules as errored, email once a day. */
async function onSyncJobDead(current: Job) {
  const calendarId = await resolveCalendarId(current.payload);
  if (!calendarId) return;
  const rules = await db.query.syncRule.findMany({
    where: and(eq(syncRule.sourceCalendarId, calendarId), eq(syncRule.status, "active")),
    with: { source: true, target: true },
  });
  for (const rule of rules) {
    await markRuleError(rule, "max_attempts");
    const owner = await db.query.user.findFirst({ where: eq(user.id, rule.userId) });
    if (!owner?.emailNotifications) continue;
    const t = getServerTranslator(owner.locale);
    await sendEmail({
      to: owner.email,
      template: "rule-error",
      props: {
        source: rule.source.name,
        target: rule.target.name,
        reason: t("rules.reason.max_attempts"),
        url: `${publicEnv.appUrl}/rules/${rule.id}`,
      },
      locale: owner.locale,
      userId: owner.id,
      idempotencyKey: `rule-error:${rule.id}:${new Date().toISOString().slice(0, 10)}`,
    }).catch((error) => log.error("email.rule_error_failed", { error: String(error) }));
  }
}

export type ProcessSummary = {
  processed: number;
  failed: number;
  deferred: number;
  durationMs: number;
};

/**
 * Claims and runs due jobs until the time budget is spent. Safe to run from
 * overlapping cron calls and `after()` callbacks: claims use SKIP LOCKED.
 */
export async function processJobs({ budgetMs }: { budgetMs: number }): Promise<ProcessSummary> {
  const workerId = `worker-${randomUUID()}`;
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs - SAFETY_MARGIN_MS;
  const summary: ProcessSummary = { processed: 0, failed: 0, deferred: 0, durationMs: 0 };

  while (Date.now() < deadline) {
    const batch = await claimJobs(workerId, BATCH_SIZE);
    if (batch.length === 0) break;
    for (const current of batch) {
      if (Date.now() >= deadline) {
        await deferJob(current, 0);
        summary.deferred += 1;
        continue;
      }
      try {
        const outcome = await runJob(current, deadline);
        if (outcome === "done") {
          await completeJob(current.id);
          summary.processed += 1;
        } else {
          await deferJob(current, outcome.defer);
          summary.deferred += 1;
        }
      } catch (error) {
        summary.failed += 1;
        const retryable = !isProviderError(error) || error.retryable || error.code === "TRANSIENT";
        const status = await failJob(current, error, { retryable });
        log.error("job.failed", {
          jobId: current.id,
          kind: current.kind,
          attempt: current.attempts,
          status,
          error: error instanceof Error ? error.message : String(error),
        });
        if (status === "dead" && (current.kind === "sync_rule" || current.kind === "full_resync_rule")) {
          await onSyncJobDead(current);
        }
      }
    }
  }
  summary.durationMs = Date.now() - startedAt;
  return summary;
}

/** Enqueue helpers with the dedupe keys used across the app. */
export const jobKeys = {
  sync: (calendarId: string) => `sync_source:${calendarId}`,
  fullResync: (calendarId: string) => `full_resync:${calendarId}`,
  watch: (calendarId: string) => `renew_watch:${calendarId}`,
  teardownRule: (ruleId: string) => `teardown_rule:${ruleId}`,
  teardownConnection: (connectionId: string) => `teardown_connection:${connectionId}`,
};
