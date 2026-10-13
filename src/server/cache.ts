import "server-only";
import { revalidateTag } from "next/cache";
import { log } from "@/server/log";

/** Cache tag naming convention (see plan/01-architecture.md). */
export const tags = {
  user: (userId: string) => `user:${userId}`,
  connections: (userId: string) => `connections:${userId}`,
  calendars: (connectionId: string) => `calendars:${connectionId}`,
  rules: (userId: string) => `rules:${userId}`,
  rule: (ruleId: string) => `rule:${ruleId}`,
  runs: (userId: string) => `runs:${userId}`,
  billing: (userId: string) => `billing:${userId}`,
};

/**
 * Expires tags from background contexts (route handlers, cron, `after()`),
 * where `updateTag` is not allowed. Outside a Next.js request (scripts) the
 * call throws and is ignored.
 */
export function invalidateTags(...list: string[]) {
  for (const tag of list) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (error) {
      log.warn("cache.invalidate_skipped", { tag, error: String(error) });
    }
  }
}
