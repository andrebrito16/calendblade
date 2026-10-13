import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { invalidateTags, tags } from "@/server/cache";
import { connectionCtx } from "@/server/connections/context";
import { decryptToken } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { calendar, calendarConnection, eventMirror, syncRule, user } from "@/server/db/schema";
import { log } from "@/server/log";
import { isProviderError } from "@/server/providers/errors";
import { getProvider } from "@/server/providers/registry";
import { REMOVED_HASH } from "./plan";
import { reconcileWatch, stopWatch } from "./watches";

export type TeardownResult = "done" | "partial";

/**
 * Removes a rule's mirrors from the target (when asked), then the rule
 * itself unless `keepRule`. Stops when `deadline` passes so the caller can
 * reschedule; progress is persisted per mirror, so resuming is safe.
 */
export async function teardownRule(
  ruleId: string,
  opts: { deleteMirrors: boolean; keepRule?: boolean; deadline: number },
): Promise<TeardownResult> {
  const rule = await db.query.syncRule.findFirst({
    where: eq(syncRule.id, ruleId),
    with: { target: { with: { connection: true } } },
  });
  if (!rule) return "done";

  // "revoked" here means "being disconnected": its tokens still work.
  if (opts.deleteMirrors && rule.target.connection.status !== "needs_reauth") {
    const provider = getProvider(rule.target.connection.provider);
    const ctx = connectionCtx(rule.target.connection);
    const mirrors = await db.query.eventMirror.findMany({
      where: and(eq(eventMirror.ruleId, ruleId), isNull(eventMirror.deletedAt)),
    });
    for (const mirror of mirrors) {
      if (Date.now() > opts.deadline) return "partial";
      try {
        await provider.deleteEvent(ctx, rule.target.providerCalendarId, mirror.targetEventId);
      } catch (error) {
        if (isProviderError(error, "TOKEN_REVOKED") || isProviderError(error, "FORBIDDEN")) break;
        throw error;
      }
      await db
        .update(eventMirror)
        .set({ deletedAt: new Date(), contentHash: REMOVED_HASH })
        .where(eq(eventMirror.id, mirror.id));
    }
  }

  if (!opts.keepRule) {
    await db.delete(syncRule).where(eq(syncRule.id, ruleId));
    await reconcileWatch(rule.sourceCalendarId);
  }
  invalidateTags(tags.rules(rule.userId), tags.rule(rule.id), tags.runs(rule.userId));
  return "done";
}

/**
 * Disconnects an account: tears down every rule touching its calendars
 * (deleting mirrors while tokens still work), stops push channels, revokes
 * the token at the provider and deletes the connection. If the owner asked
 * to delete their account, the user row goes once nothing is left.
 */
export async function teardownConnection(
  connectionId: string,
  opts: { deleteMirrors: boolean; deadline: number },
): Promise<TeardownResult> {
  const connection = await db.query.calendarConnection.findFirst({
    where: eq(calendarConnection.id, connectionId),
  });
  if (!connection) return "done";

  const calendarIds = (
    await db.select({ id: calendar.id }).from(calendar).where(eq(calendar.connectionId, connectionId))
  ).map((row) => row.id);

  if (calendarIds.length > 0) {
    const rules = await db
      .select({ id: syncRule.id })
      .from(syncRule)
      .where(
        or(inArray(syncRule.sourceCalendarId, calendarIds), inArray(syncRule.targetCalendarId, calendarIds)),
      );
    for (const rule of rules) {
      const result = await teardownRule(rule.id, {
        deleteMirrors: opts.deleteMirrors,
        deadline: opts.deadline,
      });
      if (result === "partial") return "partial";
    }
    for (const id of calendarIds) await stopWatch(id);
  }

  if (connection.refreshTokenEnc) {
    try {
      await getProvider(connection.provider).revoke(decryptToken(connection.refreshTokenEnc));
    } catch (error) {
      log.warn("connection.revoke_failed", { connectionId, error: String(error) });
    }
  }
  await db.delete(calendarConnection).where(eq(calendarConnection.id, connectionId));
  invalidateTags(tags.connections(connection.userId), tags.rules(connection.userId));

  const owner = await db.query.user.findFirst({ where: eq(user.id, connection.userId) });
  if (owner?.deletedAt) await deleteUserIfEmpty(owner.id);
  return "done";
}

/** Final step of account deletion: removes the user once connections are gone. */
export async function deleteUserIfEmpty(userId: string) {
  const remaining = await db.query.calendarConnection.findFirst({
    where: eq(calendarConnection.userId, userId),
  });
  if (remaining) return false;
  await db.delete(user).where(eq(user.id, userId));
  log.info("user.deleted", { userId });
  return true;
}
