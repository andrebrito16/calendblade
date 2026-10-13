import type { EventTime, NormalizedEvent } from "../providers/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SyncWindow = { start: Date; end: Date };

export function syncWindow(now: Date, pastDays: number, futureDays: number): SyncWindow {
  return {
    start: new Date(now.getTime() - pastDays * DAY_MS),
    end: new Date(now.getTime() + futureDays * DAY_MS),
  };
}

/** Widest window across rules sharing a source calendar. */
export function unionWindow(windows: SyncWindow[]): SyncWindow {
  return {
    start: new Date(Math.min(...windows.map((window) => window.start.getTime()))),
    end: new Date(Math.max(...windows.map((window) => window.end.getTime()))),
  };
}

/** All-day dates are treated as UTC midnight; good enough for window edges. */
export function toInstant(time: EventTime | undefined): Date | null {
  if (!time) return null;
  if (time.dateTime) return new Date(time.dateTime);
  if (time.date) return new Date(`${time.date}T00:00:00Z`);
  return null;
}

export type WindowPosition = "inside" | "past" | "future";

/**
 * Where an event sits relative to the window. Recurring masters are never
 * "past": the series may still produce occurrences inside the window.
 */
export function windowPosition(event: NormalizedEvent, window: SyncWindow): WindowPosition {
  const start = toInstant(event.start);
  const end = toInstant(event.end) ?? start;
  if (start && start.getTime() >= window.end.getTime()) return "future";
  if (!event.recurrence && end && end.getTime() <= window.start.getTime()) return "past";
  return "inside";
}
