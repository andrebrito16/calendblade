"use server";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requireUser } from "@/server/auth/session";
import { tags } from "@/server/cache";
import { upsertCalendars } from "@/server/connections/calendars";
import { connectionCtx } from "@/server/connections/context";
import { db } from "@/server/db";
import { calendar, calendarConnection, syncRule } from "@/server/db/schema";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { jobKeys, processJobs } from "@/server/jobs/worker";
import { isProviderError } from "@/server/providers/errors";
import { getProvider } from "@/server/providers/registry";
import { limitAction } from "./rate-limit";
import { ActionError, runAction } from "./result";

const idSchema = z.uuid();

async function ownedConnection(userId: string, connectionId: string) {
  const connection = await db.query.calendarConnection.findFirst({
    where: and(
      eq(calendarConnection.id, idSchema.parse(connectionId)),
      eq(calendarConnection.userId, userId),
      ne(calendarConnection.status, "revoked"),
    ),
  });
  if (!connection) throw new ActionError("not_found");
  return connection;
}

export async function refreshCalendars(connectionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "connections.refresh", 10);
    const connection = await ownedConnection(user.id, connectionId);
    try {
      const calendars = await getProvider(connection.provider).listCalendars(connectionCtx(connection));
      await upsertCalendars(connection.id, calendars);
    } catch (error) {
      if (isProviderError(error, "TOKEN_REVOKED")) throw new ActionError("forbidden");
      throw error;
    }
    updateTag(tags.connections(user.id));
    updateTag(tags.calendars(connection.id));
    return undefined;
  });
}

export async function setCalendarHidden(calendarId: string, hidden: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "connections.hide", 60);
    const [row] = await db
      .select({ id: calendar.id, connectionId: calendar.connectionId })
      .from(calendar)
      .innerJoin(calendarConnection, eq(calendarConnection.id, calendar.connectionId))
      .where(and(eq(calendar.id, idSchema.parse(calendarId)), eq(calendarConnection.userId, user.id)));
    if (!row) throw new ActionError("not_found");
    await db
      .update(calendar)
      .set({ isHidden: Boolean(hidden) })
      .where(eq(calendar.id, row.id));
    updateTag(tags.connections(user.id));
    updateTag(tags.calendars(row.connectionId));
    return undefined;
  });
}

export async function disconnectConnection(
  connectionId: string,
  opts: { deleteMirrors: boolean },
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await limitAction(user.id, "connections.disconnect", 10);
    const connection = await ownedConnection(user.id, connectionId);

    // Hide it right away; the teardown job removes it for good.
    await db
      .update(calendarConnection)
      .set({ status: "revoked" })
      .where(eq(calendarConnection.id, connection.id));
    const calendarIds = db
      .select({ id: calendar.id })
      .from(calendar)
      .where(eq(calendar.connectionId, connection.id));
    await db
      .update(syncRule)
      .set({ status: "deleting" })
      .where(
        or(inArray(syncRule.sourceCalendarId, calendarIds), inArray(syncRule.targetCalendarId, calendarIds)),
      );
    await enqueue({
      kind: "teardown_connection",
      dedupeKey: jobKeys.teardownConnection(connection.id),
      payload: { connectionId: connection.id, deleteMirrors: Boolean(opts.deleteMirrors) },
    });
    after(() => processJobs({ budgetMs: Math.min(env.CRON_BUDGET_MS, 30_000) }));
    updateTag(tags.connections(user.id));
    updateTag(tags.rules(user.id));
    updateTag(tags.billing(user.id));
    return undefined;
  });
}
