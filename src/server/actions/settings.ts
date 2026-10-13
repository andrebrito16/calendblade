"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { deleteAccountSchema, notificationsSchema, profileSchema } from "@/lib/schemas/settings";
import { analytics } from "@/server/analytics/posthog";
import { auth } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/session";
import { getStripe } from "@/server/billing/stripe";
import { recordTrialUsed } from "@/server/billing/trial";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { calendarConnection, session, subscription, syncRule, user } from "@/server/db/schema";
import { env, publicLocales } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { jobKeys, processJobs } from "@/server/jobs/worker";
import { log } from "@/server/log";
import { deleteUserIfEmpty } from "@/server/sync/teardown";
import { limitAction } from "./rate-limit";
import { ActionError, runAction } from "./result";

export async function updateProfile(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const current = await requireUser();
    await limitAction(current.id, "settings.profile", 20);
    const values = profileSchema.parse(input);
    await db
      .update(user)
      .set({ name: values.name, timezone: values.timezone })
      .where(eq(user.id, current.id));
    updateTag(tags.user(current.id));
    return undefined;
  });
}

export async function updateLocale(locale: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const current = await requireUser();
    await limitAction(current.id, "settings.locale", 20);
    const value = z.string().parse(locale);
    if (!publicLocales.includes(value)) throw new ActionError("forbidden");
    await db.update(user).set({ locale: value }).where(eq(user.id, current.id));
    updateTag(tags.user(current.id));
    return undefined;
  });
}

export async function updateNotifications(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const current = await requireUser();
    await limitAction(current.id, "settings.notifications", 30);
    const values = notificationsSchema.parse(input);
    await db
      .update(user)
      .set({ emailNotifications: values.emailNotifications })
      .where(eq(user.id, current.id));
    updateTag(tags.user(current.id));
    return undefined;
  });
}

export async function completeOnboarding(): Promise<ActionResult> {
  return runAction(async () => {
    const current = await requireUser();
    if (!current.onboardingCompletedAt) {
      await db.update(user).set({ onboardingCompletedAt: new Date() }).where(eq(user.id, current.id));
      analytics.capture(current.id, "onboarding_completed");
    }
    updateTag(tags.user(current.id));
    return undefined;
  });
}

/**
 * Self-service account deletion: cancels billing, signs out everywhere, then
 * tears down every connection (optionally deleting mirrors first) in the
 * background. The user row goes once the last connection is removed.
 */
export async function deleteAccount(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const current = await requireUser();
    await limitAction(current.id, "settings.delete", 5);
    const values = deleteAccountSchema.parse(input);

    if (env.BILLING_ENABLED) {
      const subs = await db.query.subscription.findMany({
        where: eq(subscription.referenceId, current.id),
      });
      if (subs.some((sub) => sub.trialStart || sub.trialEnd)) await recordTrialUsed(current.email);
      for (const sub of subs) {
        if (!sub.stripeSubscriptionId || ["canceled", "incomplete_expired"].includes(sub.status)) continue;
        try {
          await getStripe().subscriptions.cancel(sub.stripeSubscriptionId);
        } catch (error) {
          log.error("account.cancel_subscription_failed", { error: String(error) });
        }
      }
    }

    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, current.id));
    await db.update(syncRule).set({ status: "deleting" }).where(eq(syncRule.userId, current.id));
    const connections = await db
      .update(calendarConnection)
      .set({ status: "revoked" })
      .where(eq(calendarConnection.userId, current.id))
      .returning({ id: calendarConnection.id });
    for (const connection of connections) {
      await enqueue({
        kind: "teardown_connection",
        dedupeKey: jobKeys.teardownConnection(connection.id),
        payload: { connectionId: connection.id, deleteMirrors: values.deleteMirrors },
      });
    }

    try {
      await auth.api.signOut({ headers: await headers() });
    } catch {
      // Session already gone.
    }
    await db.delete(session).where(eq(session.userId, current.id));
    if (connections.length === 0) await deleteUserIfEmpty(current.id);
    else after(() => processJobs({ budgetMs: Math.min(env.CRON_BUDGET_MS, 30_000) }));
    updateTag(tags.user(current.id));
    return undefined;
  });
}
