"use server";

import { and, eq, ne } from "drizzle-orm";
import { updateTag } from "next/cache";
import { after } from "next/server";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/server/auth/session";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { syncRule } from "@/server/db/schema";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { jobKeys, processJobs } from "@/server/jobs/worker";
import { limitAction } from "./rate-limit";
import { runAction } from "./result";

/** Paused-account banner action: delete every mirror, keep the rules. */
export async function removeAllMirrors(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "billing.removeMirrors", 3);
    const rules = await db
      .select({ id: syncRule.id })
      .from(syncRule)
      .where(and(eq(syncRule.userId, user.id), ne(syncRule.status, "deleting")));
    for (const rule of rules) {
      await enqueue({
        kind: "teardown_rule",
        dedupeKey: jobKeys.teardownRule(rule.id),
        payload: { ruleId: rule.id, deleteMirrors: true, keepRule: true },
      });
    }
    after(() => processJobs({ budgetMs: Math.min(env.CRON_BUDGET_MS, 30_000) }));
    updateTag(tags.rules(user.id));
    return undefined;
  });
}
