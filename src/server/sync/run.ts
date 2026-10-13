import "server-only";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { analytics } from "@/server/analytics/posthog";
import { invalidateTags, tags } from "@/server/cache";
import { connectionCtx } from "@/server/connections/context";
import { db } from "@/server/db";
import { calendar, eventMirror, syncRule, syncRun, user } from "@/server/db/schema";
import { getServerTranslator } from "@/server/i18n/messages";
import { log } from "@/server/log";
import { isMissing, isProviderError, ProviderError } from "@/server/providers/errors";
import { getProvider } from "@/server/providers/registry";
import type { CalendarProvider, ConnectionCtx, MirrorInput, NormalizedEvent } from "@/server/providers/types";
import {
  type Decision,
  type InstanceRef,
  type MirrorState,
  plan,
  REMOVED_HASH,
  type RuleConfig,
} from "./plan";
import { type SyncWindow, syncWindow, toInstant, unionWindow } from "./window";

export type RunTrigger = "webhook" | "cron" | "manual" | "initial";

type RuleRow = typeof syncRule.$inferSelect;
type MirrorRow = typeof eventMirror.$inferSelect;
type Counters = { created: number; updated: number; deleted: number; skipped: number };

const LEASE_MS = 5 * 60 * 1000;
const RECREATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Reasons a rule stops by itself (shown in the UI via rules.reason.*). */
export type RuleErrorReason =
  | "target_forbidden"
  | "target_not_found"
  | "source_not_found"
  | "max_attempts"
  | "unknown";

type RuleState = {
  rule: RuleRow;
  config: RuleConfig;
  window: SyncWindow;
  runId: string;
  counters: Counters;
  target: {
    providerCalendarId: string;
    ctx: ConnectionCtx;
    provider: CalendarProvider;
    connectionActive: boolean;
  };
  mirrors: Map<string, MirrorRow>;
  stopped: RuleErrorReason | null;
  ctx: { busyTitle: string; attendeesHeading: string };
};

export type SyncResult =
  | { status: "done"; rules: number }
  | { status: "busy" }
  | { status: "skipped"; reason: string };

/**
 * Series masters before their occurrences: an exception can only patch the
 * target series once the master mirror exists, otherwise it would be mirrored
 * standalone and then duplicated by the series.
 */
function mastersFirst(events: NormalizedEvent[]) {
  return [...events].sort(
    (a, b) => Number(Boolean(a.recurringEventId)) - Number(Boolean(b.recurringEventId)),
  );
}

/** Takes the per-calendar lease. Returns false if another worker holds it. */
async function acquireLease(calendarId: string) {
  const [row] = await db
    .update(calendar)
    .set({ syncLockedUntil: new Date(Date.now() + LEASE_MS) })
    .where(
      and(
        eq(calendar.id, calendarId),
        or(isNull(calendar.syncLockedUntil), lt(calendar.syncLockedUntil, new Date())),
      ),
    )
    .returning({ id: calendar.id });
  return Boolean(row);
}

async function releaseLease(calendarId: string) {
  await db.update(calendar).set({ syncLockedUntil: null }).where(eq(calendar.id, calendarId));
}

function toConfig(rule: RuleRow): RuleConfig {
  return {
    id: rule.id,
    mode: rule.mode,
    busyTitle: rule.busyTitle,
    titlePrefix: rule.titlePrefix,
    colorId: rule.colorId,
    includeAllDay: rule.includeAllDay,
    includeDeclined: rule.includeDeclined,
    includeTentative: rule.includeTentative,
    includePrivate: rule.includePrivate,
    pastDays: rule.pastDays,
    futureDays: rule.futureDays,
  };
}

function mirrorState(row: MirrorRow | undefined): MirrorState | null {
  return row
    ? { targetEventId: row.targetEventId, contentHash: row.contentHash, deletedAt: row.deletedAt }
    : null;
}

async function saveMirror(
  state: RuleState,
  event: NormalizedEvent,
  values: Partial<typeof eventMirror.$inferInsert> & { targetEventId: string; contentHash: string },
) {
  const row = {
    ruleId: state.rule.id,
    sourceEventId: event.id,
    sourceIcalUid: event.icalUid ?? null,
    sourceEtag: event.etag ?? null,
    sourceStart: toInstant(event.start),
    sourceEnd: toInstant(event.end),
    isRecurringMaster: Boolean(event.recurrence?.length),
    deletedAt: null,
    ...values,
  };
  const [saved] = await db
    .insert(eventMirror)
    .values(row)
    .onConflictDoUpdate({
      target: [eventMirror.ruleId, eventMirror.sourceEventId],
      set: { ...row, updatedAt: new Date() },
    })
    .returning();
  if (saved) state.mirrors.set(event.id, saved);
}

/** Resolves the target occurrence of a mirrored series, if the series is mirrored. */
async function findTargetInstance(state: RuleState, instanceOf: InstanceRef) {
  const master = state.mirrors.get(instanceOf.masterSourceEventId);
  if (!master || master.deletedAt) return null;
  const { provider, ctx, providerCalendarId } = state.target;
  return provider.getInstance(ctx, providerCalendarId, master.targetEventId, instanceOf.originalStartTime);
}

async function writeCreate(state: RuleState, input: MirrorInput, instanceOf?: InstanceRef) {
  const { provider, ctx, providerCalendarId } = state.target;
  if (instanceOf) {
    const instance = await findTargetInstance(state, instanceOf);
    if (instance) {
      await provider.updateEvent(ctx, providerCalendarId, instance.id, input);
      return instance.id;
    }
  }
  const created = await provider.createEvent(ctx, providerCalendarId, input);
  return created.id;
}

async function apply(state: RuleState, event: NormalizedEvent, decision: Decision) {
  const { provider, ctx, providerCalendarId } = state.target;
  const existing = state.mirrors.get(event.id);

  switch (decision.type) {
    case "skip":
      state.counters.skipped += 1;
      return;

    case "create": {
      const targetEventId = await writeCreate(state, decision.input, decision.instanceOf);
      await saveMirror(state, event, {
        targetEventId,
        contentHash: decision.hash,
        recreateCount: existing?.recreateCount ?? 0,
      });
      state.counters.created += 1;
      return;
    }

    case "update": {
      try {
        await provider.updateEvent(ctx, providerCalendarId, decision.targetEventId, decision.input);
        await saveMirror(state, event, {
          targetEventId: decision.targetEventId,
          contentHash: decision.hash,
        });
        state.counters.updated += 1;
      } catch (error) {
        if (!isMissing(error)) throw error;
        // The user deleted the mirror. Recreate once; respect a second deletion.
        const recentlyRecreated =
          (existing?.recreateCount ?? 0) >= 1 &&
          existing?.lastRecreatedAt &&
          Date.now() - existing.lastRecreatedAt.getTime() < RECREATE_WINDOW_MS;
        if (recentlyRecreated) {
          await saveMirror(state, event, {
            targetEventId: decision.targetEventId,
            contentHash: decision.hash,
            deletedAt: new Date(),
          });
          state.counters.skipped += 1;
          return;
        }
        const targetEventId = await writeCreate(state, decision.input, decision.instanceOf);
        await saveMirror(state, event, {
          targetEventId,
          contentHash: decision.hash,
          recreateCount: (existing?.recreateCount ?? 0) + 1,
          lastRecreatedAt: new Date(),
        });
        state.counters.created += 1;
      }
      return;
    }

    case "delete": {
      let targetEventId = decision.targetEventId;
      if (!targetEventId && decision.instanceOf) {
        const instance = await findTargetInstance(state, decision.instanceOf);
        if (!instance) {
          state.counters.skipped += 1;
          return;
        }
        targetEventId = instance.id;
      }
      if (!targetEventId) return;
      await provider.deleteEvent(ctx, providerCalendarId, targetEventId);
      await saveMirror(state, event, {
        targetEventId,
        contentHash: REMOVED_HASH,
        deletedAt: new Date(),
      });
      state.counters.deleted += 1;
      return;
    }
  }
}

/** Translates provider failures on the target side into rule-level outcomes. */
function classifyTargetError(error: unknown): RuleErrorReason | null {
  if (isProviderError(error, "FORBIDDEN")) return "target_forbidden";
  if (isProviderError(error, "NOT_FOUND")) return "target_not_found";
  return null;
}

async function processEvent(state: RuleState, event: NormalizedEvent, now: Date) {
  if (state.stopped) return;
  const decision = plan(event, state.config, mirrorState(state.mirrors.get(event.id)), {
    now,
    ...state.ctx,
  });
  try {
    await apply(state, event, decision);
  } catch (error) {
    const reason = classifyTargetError(error);
    if (reason) {
      state.stopped = reason;
      return;
    }
    if (isProviderError(error, "INVALID")) {
      // One malformed event must not block the rest of the calendar.
      log.warn("sync.event_rejected", { ruleId: state.rule.id, eventId: event.id, error: error.message });
      state.counters.skipped += 1;
      return;
    }
    throw error;
  }
}

/** Full resync: adopt mirrors found in the target, then delete orphans. */
async function reconcile(state: RuleState, sourceEvents: Map<string, NormalizedEvent>, now: Date) {
  const { provider, ctx, providerCalendarId } = state.target;
  const window = state.window;

  // Mirrors that exist in the target (by extended property) but not in our DB
  // are adopted, so a crash between write and bookkeeping never duplicates.
  const targetMirrors = new Map<string, NormalizedEvent>();
  let pageToken: string | undefined;
  do {
    const page = await provider.listEvents(ctx, providerCalendarId, {
      timeMin: window.start,
      timeMax: window.end,
      pageToken,
      privateExtendedProperty: `calendblade.origin=${state.rule.id}`,
    });
    for (const event of page.events) {
      if (event.status === "cancelled") continue;
      const sourceId = event.origin?.sourceEventId;
      if (sourceId) targetMirrors.set(sourceId, event);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  for (const [sourceId, targetEvent] of targetMirrors) {
    const row = state.mirrors.get(sourceId);
    if (!row || row.deletedAt) {
      const sourceEvent = sourceEvents.get(sourceId);
      if (sourceEvent) {
        // A placeholder hash forces an update that rewrites the adopted event.
        await saveMirror(state, sourceEvent, { targetEventId: targetEvent.id, contentHash: "adopted" });
      }
    }
  }

  for (const event of sourceEvents.values()) {
    await processEvent(state, event, now);
    if (state.stopped) return;
  }

  // Mirrors whose source vanished from the window.
  for (const row of state.mirrors.values()) {
    if (row.deletedAt || sourceEvents.has(row.sourceEventId)) continue;
    const start = row.sourceStart?.getTime();
    const inWindow =
      row.isRecurringMaster ||
      (start !== undefined && start >= window.start.getTime() && start < window.end.getTime());
    if (!inWindow) continue;
    await provider.deleteEvent(ctx, providerCalendarId, row.targetEventId);
    await db
      .update(eventMirror)
      .set({ deletedAt: new Date(), contentHash: REMOVED_HASH })
      .where(eq(eventMirror.id, row.id));
    state.counters.deleted += 1;
  }

  // Target events tagged with this rule that nothing references (orphans).
  const referenced = new Set(
    [...state.mirrors.values()].filter((row) => !row.deletedAt).map((row) => row.targetEventId),
  );
  for (const [sourceId, targetEvent] of targetMirrors) {
    if (sourceEvents.has(sourceId) || referenced.has(targetEvent.id)) continue;
    await provider.deleteEvent(ctx, providerCalendarId, targetEvent.id);
    state.counters.deleted += 1;
  }
}

async function finishRun(
  state: RuleState,
  status: "succeeded" | "failed" | "skipped",
  error?: { code: string; message: string },
) {
  const finishedAt = new Date();
  await db
    .update(syncRun)
    .set({
      status,
      finishedAt,
      createdCount: state.counters.created,
      updatedCount: state.counters.updated,
      deletedCount: state.counters.deleted,
      skippedCount: state.counters.skipped,
      errorCode: error?.code ?? null,
      errorMessage: error?.message?.slice(0, 1000) ?? null,
    })
    .where(eq(syncRun.id, state.runId));
  await db.update(syncRule).set({ lastRunAt: finishedAt }).where(eq(syncRule.id, state.rule.id));
  invalidateTags(tags.runs(state.rule.userId), tags.rule(state.rule.id), tags.rules(state.rule.userId));
}

export async function markRuleError(rule: Pick<RuleRow, "id" | "userId">, reason: RuleErrorReason) {
  await db
    .update(syncRule)
    .set({ status: "error", statusReason: reason })
    .where(and(eq(syncRule.id, rule.id), inArray(syncRule.status, ["active", "error"])));
  invalidateTags(tags.rules(rule.userId), tags.rule(rule.id));
}

/**
 * Syncs one source calendar into every active rule that reads from it.
 * The sync token belongs to the calendar, so all its rules consume the same
 * change feed in one pass. `full` (or a missing/expired token) lists the
 * whole window and reconciles mirrors instead.
 */
export async function syncSourceCalendar(
  calendarId: string,
  opts: { trigger: RunTrigger; full?: boolean; now?: Date },
): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  if (!(await acquireLease(calendarId))) return { status: "busy" };

  const states: RuleState[] = [];
  try {
    const source = await db.query.calendar.findFirst({
      where: eq(calendar.id, calendarId),
      with: { connection: true },
    });
    if (!source) return { status: "skipped", reason: "calendar_missing" };

    const rules = await db.query.syncRule.findMany({
      where: and(eq(syncRule.sourceCalendarId, calendarId), eq(syncRule.status, "active")),
      with: { target: { with: { connection: true } } },
    });
    if (rules.length === 0) return { status: "skipped", reason: "no_active_rules" };

    const owner = await db.query.user.findFirst({ where: eq(user.id, source.connection.userId) });
    if (!owner || owner.pausedAt || owner.deletedAt) return { status: "skipped", reason: "user_inactive" };
    const t = getServerTranslator(owner.locale);
    const ctxTexts = {
      busyTitle: t("sync.busyTitle"),
      attendeesHeading: t("sync.attendeesHeading"),
    };

    const sourceProvider = getProvider(source.connection.provider);
    const sourceCtx = connectionCtx(source.connection);

    for (const rule of rules) {
      const [run] = await db
        .insert(syncRun)
        .values({
          ruleId: rule.id,
          userId: rule.userId,
          trigger: opts.trigger,
          status: "running",
          startedAt: now,
        })
        .returning({ id: syncRun.id });
      const mirrors = await db.query.eventMirror.findMany({ where: eq(eventMirror.ruleId, rule.id) });
      states.push({
        rule,
        config: toConfig(rule),
        window: syncWindow(now, rule.pastDays, rule.futureDays),
        runId: run?.id ?? "",
        counters: { created: 0, updated: 0, deleted: 0, skipped: 0 },
        target: {
          providerCalendarId: rule.target.providerCalendarId,
          ctx: connectionCtx(rule.target.connection),
          provider: getProvider(rule.target.connection.provider),
          connectionActive: rule.target.connection.status === "active",
        },
        mirrors: new Map(mirrors.map((row) => [row.sourceEventId, row])),
        stopped: null,
        ctx: ctxTexts,
      });
    }

    const blocked = (state: RuleState) =>
      source.connection.status !== "active" || !state.target.connectionActive;
    const runnable = states.filter((state) => !blocked(state));
    for (const state of states.filter(blocked)) await finishRun(state, "skipped");
    if (runnable.length === 0) return { status: "skipped", reason: "connection_inactive" };

    let full = Boolean(opts.full) || !source.syncToken;
    let nextSyncToken: string | undefined;

    if (!full) {
      const changes: NormalizedEvent[] = [];
      let pageToken: string | undefined;
      do {
        const page = await sourceProvider.listEvents(sourceCtx, source.providerCalendarId, {
          syncToken: source.syncToken ?? undefined,
          pageToken,
        });
        if (page.invalidSyncToken) {
          // HTTP 410: the token expired. Fall back to a full windowed resync.
          await db.update(calendar).set({ syncToken: null }).where(eq(calendar.id, calendarId));
          full = true;
          break;
        }
        changes.push(...page.events);
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);

      if (!full) {
        for (const event of mastersFirst(changes)) {
          for (const state of runnable) await processEvent(state, event, now);
        }
      }
    }

    if (full) {
      const window = unionWindow(runnable.map((state) => state.window));
      const sourceEvents = new Map<string, NormalizedEvent>();
      let pageToken: string | undefined;
      nextSyncToken = undefined;
      do {
        const page = await sourceProvider.listEvents(sourceCtx, source.providerCalendarId, {
          timeMin: window.start,
          timeMax: window.end,
          pageToken,
        });
        for (const event of page.events) sourceEvents.set(event.id, event);
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);

      const ordered = new Map(mastersFirst([...sourceEvents.values()]).map((event) => [event.id, event]));
      for (const state of runnable) {
        try {
          await reconcile(state, ordered, now);
        } catch (error) {
          const reason = classifyTargetError(error);
          if (!reason) throw error;
          state.stopped = reason;
        }
      }
    }

    if (nextSyncToken) {
      await db.update(calendar).set({ syncToken: nextSyncToken }).where(eq(calendar.id, calendarId));
    }

    for (const state of runnable) {
      if (state.stopped) {
        await markRuleError(state.rule, state.stopped);
        await finishRun(state, "failed", { code: state.stopped, message: `Rule stopped: ${state.stopped}` });
        analytics.capture(state.rule.userId, "sync_run_failed", { reason: state.stopped });
      } else {
        await finishRun(state, "succeeded");
        analytics.capture(state.rule.userId, "sync_run_completed", {
          trigger: opts.trigger,
          full,
          ...state.counters,
        });
      }
      log.info("sync.run", {
        ruleId: state.rule.id,
        trigger: opts.trigger,
        full,
        stopped: state.stopped,
        durationMs: Date.now() - now.getTime(),
        ...state.counters,
      });
    }
    return { status: "done", rules: runnable.length };
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "UNEXPECTED";
    const message = error instanceof Error ? error.message : String(error);
    for (const state of states) {
      const [current] = await db
        .select({ status: syncRun.status })
        .from(syncRun)
        .where(eq(syncRun.id, state.runId));
      if (current?.status === "running") await finishRun(state, "failed", { code, message });
    }
    if (isProviderError(error, "NOT_FOUND")) {
      // The source calendar itself is gone.
      for (const state of states) await markRuleError(state.rule, "source_not_found");
      return { status: "skipped", reason: "source_not_found" };
    }
    if (isProviderError(error, "TOKEN_REVOKED")) {
      // connectionCtx already flagged the connection and paused its rules.
      return { status: "skipped", reason: "token_revoked" };
    }
    throw error;
  } finally {
    await releaseLease(calendarId);
  }
}

/** Counts live mirrors per rule (UI: "mirrored events"). */
export async function countLiveMirrors(ruleIds: string[]) {
  if (ruleIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ ruleId: eventMirror.ruleId, count: sql<number>`count(*)::int` })
    .from(eventMirror)
    .where(and(inArray(eventMirror.ruleId, ruleIds), isNull(eventMirror.deletedAt)))
    .groupBy(eventMirror.ruleId);
  return new Map(rows.map((row) => [row.ruleId, row.count]));
}
