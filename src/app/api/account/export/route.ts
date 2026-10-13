import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { limitAction } from "@/server/actions/rate-limit";
import { ActionError } from "@/server/actions/result";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  calendar,
  calendarConnection,
  emailLog,
  eventMirror,
  subscription,
  syncRule,
  syncRun,
  user,
} from "@/server/db/schema";

/**
 * Data portability (GDPR Art. 20, LGPD Art. 18 V): everything we hold about
 * the signed-in user as JSON. OAuth tokens are never included.
 */
export async function GET() {
  let current: Awaited<ReturnType<typeof requireUser>>;
  try {
    current = await requireUser();
    await limitAction(current.id, "account.export", 5, 3600);
  } catch (error) {
    const status = error instanceof ActionError ? 429 : 401;
    return NextResponse.json({ error: status === 429 ? "rate_limited" : "unauthorized" }, { status });
  }

  const profile = await db.query.user.findFirst({
    where: eq(user.id, current.id),
    columns: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      image: true,
      timezone: true,
      locale: true,
      emailNotifications: true,
      consentErrors: true,
      consentAnalytics: true,
      consentUpdatedAt: true,
      onboardingCompletedAt: true,
      pausedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const connections = await db.query.calendarConnection.findMany({
    where: eq(calendarConnection.userId, current.id),
    columns: {
      id: true,
      provider: true,
      email: true,
      displayName: true,
      scopes: true,
      status: true,
      createdAt: true,
    },
    with: {
      calendars: {
        columns: {
          id: true,
          name: true,
          color: true,
          timezone: true,
          accessRole: true,
          isPrimary: true,
          isHidden: true,
        },
      },
    },
  });
  const rules = await db.query.syncRule.findMany({ where: eq(syncRule.userId, current.id) });
  const ruleIds = rules.map((rule) => rule.id);
  const mirrors = ruleIds.length
    ? await db
        .select({
          ruleId: eventMirror.ruleId,
          sourceEventId: eventMirror.sourceEventId,
          targetEventId: eventMirror.targetEventId,
          sourceStart: eventMirror.sourceStart,
          sourceEnd: eventMirror.sourceEnd,
          deletedAt: eventMirror.deletedAt,
        })
        .from(eventMirror)
        .where(inArray(eventMirror.ruleId, ruleIds))
    : [];
  const runs = await db
    .select()
    .from(syncRun)
    .where(
      and(eq(syncRun.userId, current.id), gte(syncRun.startedAt, new Date(Date.now() - 90 * 86_400_000))),
    )
    .orderBy(desc(syncRun.startedAt));
  const subscriptions = await db
    .select({
      plan: subscription.plan,
      status: subscription.status,
      periodStart: subscription.periodStart,
      periodEnd: subscription.periodEnd,
      trialStart: subscription.trialStart,
      trialEnd: subscription.trialEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.referenceId, current.id));
  const emails = await db
    .select({ template: emailLog.template, sentAt: emailLog.sentAt })
    .from(emailLog)
    .where(eq(emailLog.userId, current.id));

  const exportedAt = new Date();
  const body = JSON.stringify(
    {
      exportedAt,
      profile,
      connections,
      calendarsUsedInRules: ruleIds.length
        ? await db
            .select({ id: calendar.id, name: calendar.name })
            .from(calendar)
            .where(
              inArray(
                calendar.id,
                rules.flatMap((rule) => [rule.sourceCalendarId, rule.targetCalendarId]),
              ),
            )
        : [],
      rules,
      mirrors,
      syncRuns: runs,
      subscriptions,
      emailsSent: emails,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="calendblade-export-${exportedAt.toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
