import "server-only";
import { and, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { job } from "@/server/db/schema";

export type JobKind = (typeof job.$inferSelect)["kind"];
export type Job = typeof job.$inferSelect;

/** Exponential backoff for retryable failures: 30s, 2m, 10m, 30m, 2h. */
export const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
const STALE_CLAIM_MS = 10 * 60 * 1000;

export type EnqueueInput = {
  kind: JobKind;
  payload?: Record<string, unknown>;
  /** At most one pending job per key; a second enqueue coalesces into it. */
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
};

/**
 * Adds a job. With a dedupe key, an existing pending job is kept and its
 * `run_at` moves earlier if the new one is due sooner (e.g. "Sync now" after
 * a debounced webhook). Claimed jobs don't block: a change arriving during a
 * run queues a follow-up.
 */
export async function enqueue(input: EnqueueInput) {
  const values = {
    kind: input.kind,
    payload: input.payload ?? {},
    dedupeKey: input.dedupeKey ?? null,
    runAt: input.runAt ?? new Date(),
    maxAttempts: input.maxAttempts ?? 5,
  };
  if (!input.dedupeKey) {
    const [row] = await db.insert(job).values(values).returning();
    return row;
  }
  const [row] = await db
    .insert(job)
    .values(values)
    .onConflictDoUpdate({
      target: job.dedupeKey,
      targetWhere: sql`${job.status} = 'pending'`,
      set: {
        runAt: sql`least(${job.runAt}, excluded.run_at)`,
        payload: sql`${job.payload} || excluded.payload`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Push-channel jobs are quick and decide whether later changes arrive in real
 * time, so they run before syncs: a long first sync that spends the budget must
 * not leave a new rule without a channel until the next cron.
 */
const kindPriority = sql<number>`case when ${job.kind} = 'renew_watch' then 0 else 1 end`;

function byPriority(a: Job, b: Job) {
  const rank = (row: Job) => (row.kind === "renew_watch" ? 0 : 1);
  return rank(a) - rank(b) || a.runAt.getTime() - b.runAt.getTime();
}

/** Atomically claims up to `limit` due jobs, in run order. Safe across parallel workers. */
export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  const due = db
    .select({ id: job.id })
    .from(job)
    .where(and(eq(job.status, "pending"), lte(job.runAt, new Date())))
    .orderBy(kindPriority, job.runAt)
    .limit(limit)
    .for("update", { skipLocked: true });

  // UPDATE ... RETURNING doesn't preserve the subquery's order.
  const claimed = await db
    .update(job)
    .set({
      status: "claimed",
      lockedAt: new Date(),
      lockedBy: workerId,
      attempts: sql`${job.attempts} + 1`,
    })
    .where(inArray(job.id, due))
    .returning();
  return claimed.sort(byPriority);
}

export async function completeJob(id: string) {
  await db
    .update(job)
    .set({ status: "done", lockedAt: null, lockedBy: null, lastError: null })
    .where(eq(job.id, id));
}

/**
 * Records a failure. Retryable failures are rescheduled with backoff until
 * `max_attempts`, then the job is dead. Returns the resulting status.
 */
export async function failJob(
  current: Job,
  error: unknown,
  { retryable }: { retryable: boolean },
): Promise<"pending" | "dead" | "failed"> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = current.attempts >= current.maxAttempts;
  const status = !retryable ? "failed" : exhausted ? "dead" : "pending";
  const delay = RETRY_BACKOFF_MS[Math.min(current.attempts - 1, RETRY_BACKOFF_MS.length - 1)] ?? 0;
  await db
    .update(job)
    .set({
      status,
      lastError: message.slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
      ...(status === "pending" ? { runAt: new Date(Date.now() + delay) } : {}),
    })
    .where(eq(job.id, current.id));
  return status;
}

/** Puts a claimed job back without counting the attempt (lock busy, budget). */
export async function deferJob(current: Job, delayMs: number) {
  await db
    .update(job)
    .set({
      status: "pending",
      attempts: sql`greatest(${job.attempts} - 1, 0)`,
      runAt: new Date(Date.now() + delayMs),
      lockedAt: null,
      lockedBy: null,
    })
    .where(eq(job.id, current.id));
}

/** Releases claims held longer than 10 minutes (crashed workers). */
export async function resetStaleClaims() {
  const rows = await db
    .update(job)
    .set({ status: "pending", lockedAt: null, lockedBy: null })
    .where(and(eq(job.status, "claimed"), lt(job.lockedAt, new Date(Date.now() - STALE_CLAIM_MS))))
    .returning({ id: job.id });
  return rows.length;
}

export async function countPendingJobs(kinds?: JobKind[]) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(job)
    .where(and(inArray(job.status, ["pending", "claimed"]), kinds ? inArray(job.kind, kinds) : undefined));
  return row?.count ?? 0;
}

/** Deletes finished jobs older than `days`. */
export async function pruneFinishedJobs(days: number) {
  const rows = await db
    .delete(job)
    .where(
      and(
        inArray(job.status, ["done", "failed", "dead"]),
        lt(job.updatedAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000)),
      ),
    )
    .returning({ id: job.id });
  return rows.length;
}
