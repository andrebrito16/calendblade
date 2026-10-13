import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { rateLimit } from "@/server/db/schema";
import { ActionError } from "./result";

/**
 * Fixed-window limiter for Server Actions, stored in the same table Better
 * Auth uses for its own rate limits (keys are namespaced `action:`).
 */
export async function limitAction(userId: string, name: string, max = 30, windowSeconds = 60) {
  const key = `action:${name}:${userId}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const [row] = await db
    .insert(rateLimit)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} < ${windowStart} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} < ${windowStart} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });
  if ((row?.count ?? 0) > max) throw new ActionError("rate_limited");
}
