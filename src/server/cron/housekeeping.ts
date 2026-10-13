import "server-only";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { publicEnv } from "@/lib/env.public";
import { PAUSED_DATA_RETENTION_DAYS } from "@/lib/plans";
import { dataDeletionDate } from "@/server/billing/lifecycle";
import { pruneTrialHashes } from "@/server/billing/trial";
import { db } from "@/server/db";
import { calendarConnection, eventMirror, syncRule, syncRun, user, verification } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { getServerFormatter } from "@/server/i18n/messages";
import { enqueue, pruneFinishedJobs, resetStaleClaims } from "@/server/jobs/queue";
import { jobKeys } from "@/server/jobs/worker";
import { log } from "@/server/log";
import { scheduleFullResync } from "@/server/sync/schedule";
import { deleteUserIfEmpty } from "@/server/sync/teardown";

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_RETENTION_DAYS = 90;
const MIRROR_TOMBSTONE_DAYS = 30;
const DELETION_WARNING_DAYS = 7;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Daily maintenance. Each step is idempotent, so reruns are harmless. */
export async function runHousekeeping() {
  const staleClaims = await resetStaleClaims();

  // Window advance: a daily full pass per source picks up events that just
  // entered the future edge (cheap: unchanged events cost no writes).
  const sources = await db
    .selectDistinct({ calendarId: syncRule.sourceCalendarId })
    .from(syncRule)
    .innerJoin(user, eq(user.id, syncRule.userId))
    .where(and(eq(syncRule.status, "active"), isNull(user.pausedAt)));
  for (const { calendarId } of sources) await scheduleFullResync(calendarId, "cron");

  const runsDeleted = (
    await db
      .delete(syncRun)
      .where(lt(syncRun.startedAt, daysAgo(RUN_RETENTION_DAYS)))
      .returning({ id: syncRun.id })
  ).length;
  const mirrorsPruned = (
    await db
      .delete(eventMirror)
      .where(and(isNotNull(eventMirror.deletedAt), lt(eventMirror.deletedAt, daysAgo(MIRROR_TOMBSTONE_DAYS))))
      .returning({ id: eventMirror.id })
  ).length;

  // Paused accounts: warn 7 days before deletion, then delete their data.
  const warnBefore = daysAgo(PAUSED_DATA_RETENTION_DAYS - DELETION_WARNING_DAYS);
  const pausedUsers = await db.query.user.findMany({
    where: and(isNotNull(user.pausedAt), lt(user.pausedAt, warnBefore), isNull(user.deletedAt)),
  });
  let warned = 0;
  let purged = 0;
  for (const owner of pausedUsers) {
    if (!owner.pausedAt) continue;
    const deletionAt = dataDeletionDate(owner.pausedAt);
    if (deletionAt.getTime() <= Date.now()) {
      const connections = await db
        .update(calendarConnection)
        .set({ status: "revoked" })
        .where(eq(calendarConnection.userId, owner.id))
        .returning({ id: calendarConnection.id });
      await db.update(syncRule).set({ status: "deleting" }).where(eq(syncRule.userId, owner.id));
      for (const connection of connections) {
        await enqueue({
          kind: "teardown_connection",
          dedupeKey: jobKeys.teardownConnection(connection.id),
          payload: { connectionId: connection.id, deleteMirrors: false },
        });
      }
      if (connections.length > 0) purged += 1;
      continue;
    }
    const date = getServerFormatter(owner.locale, owner.timezone).dateTime(deletionAt, {
      dateStyle: "long",
    });
    const sent = await sendEmail({
      to: owner.email,
      template: "data-deletion-7d",
      props: { date, url: `${publicEnv.appUrl}/settings/billing` },
      locale: owner.locale,
      userId: owner.id,
      idempotencyKey: `data-deletion:${owner.id}:${owner.pausedAt.toISOString().slice(0, 10)}`,
    }).catch((error) => {
      log.error("email.deletion_warning_failed", { error: String(error) });
      return false;
    });
    if (sent) warned += 1;
  }

  // Accounts deleted by their owner whose teardown already finished.
  const deletedUsers = await db.query.user.findMany({
    where: isNotNull(user.deletedAt),
    columns: { id: true },
  });
  for (const { id } of deletedUsers) await deleteUserIfEmpty(id);

  await db.delete(verification).where(lt(verification.expiresAt, daysAgo(1)));
  const jobsPruned = await pruneFinishedJobs(7);
  const trialHashesPruned = await pruneTrialHashes();

  return {
    staleClaims,
    windowAdvance: sources.length,
    runsDeleted,
    mirrorsPruned,
    warned,
    purged,
    jobsPruned,
    trialHashesPruned,
  };
}
