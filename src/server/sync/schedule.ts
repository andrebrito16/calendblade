import "server-only";
import { enqueue } from "@/server/jobs/queue";
import { jobKeys } from "@/server/jobs/worker";
import type { RunTrigger } from "./run";

/** Coalesce bursts of push notifications for the same calendar. */
export const WEBHOOK_DEBOUNCE_MS = 15_000;

export function scheduleSync(calendarId: string, trigger: RunTrigger, delayMs = 0) {
  return enqueue({
    kind: "sync_rule",
    dedupeKey: jobKeys.sync(calendarId),
    payload: { calendarId, trigger },
    runAt: new Date(Date.now() + delayMs),
  });
}

export function scheduleFullResync(calendarId: string, trigger: RunTrigger) {
  return enqueue({
    kind: "full_resync_rule",
    dedupeKey: jobKeys.fullResync(calendarId),
    payload: { calendarId, trigger },
  });
}

export function scheduleWatch(calendarId: string, force = false) {
  return enqueue({
    kind: "renew_watch",
    dedupeKey: jobKeys.watch(calendarId),
    payload: { calendarId, force },
  });
}
