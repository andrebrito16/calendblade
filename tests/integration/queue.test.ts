import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { job } from "@/server/db/schema";
import {
  claimJobs,
  completeJob,
  deferJob,
  enqueue,
  failJob,
  RETRY_BACKOFF_MS,
  resetStaleClaims,
} from "@/server/jobs/queue";
import { resetAll } from "./helpers";

beforeEach(resetAll);

describe("job queue", () => {
  it("coalesces pending jobs with the same dedupe key and keeps the earliest run_at", async () => {
    const later = new Date(Date.now() + 15_000);
    const first = await enqueue({ kind: "sync_rule", dedupeKey: "k", runAt: later, payload: { a: 1 } });
    const second = await enqueue({ kind: "sync_rule", dedupeKey: "k", payload: { b: 2 } });
    expect(second?.id).toBe(first?.id);
    expect(second?.runAt.getTime()).toBeLessThan(later.getTime());
    expect(second?.payload).toEqual({ a: 1, b: 2 });
    expect(await db.select().from(job)).toHaveLength(1);
  });

  it("allows a follow-up job while one with the same key is running", async () => {
    await enqueue({ kind: "sync_rule", dedupeKey: "k" });
    await claimJobs("w1", 5);
    await enqueue({ kind: "sync_rule", dedupeKey: "k" });
    expect(await db.select().from(job)).toHaveLength(2);
  });

  it("only claims due jobs, and parallel workers never claim the same job", async () => {
    for (let i = 0; i < 6; i++) await enqueue({ kind: "sync_rule" });
    await enqueue({ kind: "sync_rule", runAt: new Date(Date.now() + 60_000) });
    const [a, b] = await Promise.all([claimJobs("w1", 4), claimJobs("w2", 4)]);
    const ids = [...a, ...b].map((row) => row.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect([...a, ...b].every((row) => row.attempts === 1 && row.status === "claimed")).toBe(true);
  });

  it("retries with exponential backoff, then dead-letters", async () => {
    await enqueue({ kind: "sync_rule", maxAttempts: 2 });
    let [current] = await claimJobs("w", 1);
    expect(await failJob(current!, new Error("boom"), { retryable: true })).toBe("pending");
    const pending = await db.query.job.findFirst({ where: eq(job.id, current!.id) });
    const delay = (pending?.runAt.getTime() ?? 0) - Date.now();
    expect(delay).toBeGreaterThan(RETRY_BACKOFF_MS[0]! - 2_000);
    expect(pending?.lastError).toBe("boom");

    await db.update(job).set({ runAt: new Date() }).where(eq(job.id, current!.id));
    [current] = await claimJobs("w", 1);
    expect(await failJob(current!, new Error("boom"), { retryable: true })).toBe("dead");
  });

  it("marks non-retryable failures as failed", async () => {
    await enqueue({ kind: "sync_rule" });
    const [current] = await claimJobs("w", 1);
    expect(await failJob(current!, new Error("bad"), { retryable: false })).toBe("failed");
  });

  it("defers without consuming an attempt and completes", async () => {
    await enqueue({ kind: "teardown_rule" });
    let [current] = await claimJobs("w", 1);
    await deferJob(current!, 0);
    [current] = await claimJobs("w", 1);
    expect(current?.attempts).toBe(1);
    await completeJob(current!.id);
    expect((await db.query.job.findFirst({ where: eq(job.id, current!.id) }))?.status).toBe("done");
  });

  it("releases stale claims", async () => {
    await enqueue({ kind: "sync_rule" });
    const [current] = await claimJobs("w", 1);
    await db
      .update(job)
      .set({ lockedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(job.id, current!.id));
    expect(await resetStaleClaims()).toBe(1);
    expect(await claimJobs("w2", 1)).toHaveLength(1);
  });
});
