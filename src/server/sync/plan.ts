import type { EventTime, MirrorInput, NormalizedEvent } from "../providers/types";
import { hashMirror } from "./hash";
import { syncWindow, windowPosition } from "./window";

export type RuleConfig = {
  id: string;
  mode: "full" | "busy";
  busyTitle: string | null;
  titlePrefix: string | null;
  colorId: string | null;
  includeAllDay: boolean;
  includeDeclined: boolean;
  includeTentative: boolean;
  includePrivate: boolean;
  pastDays: number;
  futureDays: number;
};

export type MirrorState = {
  targetEventId: string;
  contentHash: string;
  deletedAt: Date | null;
};

export type PlanContext = {
  now: Date;
  /** Localized default title for busy blocks. */
  busyTitle: string;
  /** Localized heading for the guest list appended in full mode. */
  attendeesHeading: string;
};

/** An occurrence of a recurring series (Google "exception"). */
export type InstanceRef = { masterSourceEventId: string; originalStartTime: EventTime };

export type SkipReason = "loop_guard" | "unchanged" | "filtered" | "outside_window" | "user_deleted";

export type ExclusionReason = "cancelled" | "transparent" | "declined" | "tentative" | "all_day" | "private";

export type Decision =
  | { type: "skip"; reason: SkipReason }
  | { type: "create"; input: MirrorInput; hash: string; instanceOf?: InstanceRef }
  | { type: "update"; input: MirrorInput; hash: string; targetEventId: string; instanceOf?: InstanceRef }
  | {
      type: "delete";
      /** `null` for an occurrence never mirrored on its own: cancel it in the target series. */
      targetEventId: string | null;
      instanceOf?: InstanceRef;
      reason: ExclusionReason | "outside_window";
    };

/** Content hash stored for mirrors we removed ourselves (re-creatable). */
export const REMOVED_HASH = "";

export function exclusionReason(event: NormalizedEvent, rule: RuleConfig): ExclusionReason | null {
  if (event.status === "cancelled") return "cancelled";
  if (event.transparency === "transparent") return "transparent";
  if (event.selfResponse === "declined" && !rule.includeDeclined) return "declined";
  const tentative = event.selfResponse === "tentative" || event.status === "tentative";
  if (tentative && !rule.includeTentative) return "tentative";
  if (event.allDay && !rule.includeAllDay) return "all_day";
  const isPrivate = event.visibility === "private" || event.visibility === "confidential";
  if (isPrivate && !rule.includePrivate) return "private";
  return null;
}

function attendeesText(event: NormalizedEvent, heading: string) {
  if (event.attendees.length === 0) return undefined;
  const lines = event.attendees.map((attendee) =>
    attendee.name ? `• ${attendee.name} <${attendee.email}>` : `• ${attendee.email}`,
  );
  return `${heading}:\n${lines.join("\n")}`;
}

export function buildMirrorInput(event: NormalizedEvent, rule: RuleConfig, ctx: PlanContext): MirrorInput {
  const isInstance = Boolean(event.recurringEventId);
  const base = {
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    transparency: "opaque" as const,
    colorId: rule.colorId ?? undefined,
    recurrence: isInstance ? undefined : event.recurrence,
    origin: { ruleId: rule.id, sourceEventId: event.id },
  };

  if (rule.mode === "busy") {
    return {
      ...base,
      title: rule.busyTitle?.trim() || ctx.busyTitle,
      visibility: "private",
    };
  }

  const title = [rule.titlePrefix?.trim(), event.title].filter(Boolean).join(" ");
  const description = [event.description?.trim(), attendeesText(event, ctx.attendeesHeading)]
    .filter(Boolean)
    .join("\n\n");
  return {
    ...base,
    title,
    description: description || undefined,
    location: event.location || undefined,
    visibility: event.visibility,
  };
}

/**
 * Decides what to do with one source event for one rule. Pure: no I/O.
 *
 * - Mirrors (events carrying Calendblade's origin) are never mirrored again.
 * - Excluded events (cancelled, free, filtered) remove an existing mirror.
 * - Events that leave the window into the past keep their mirror; events
 *   moved beyond the future edge lose it until the window reaches them.
 * - Writes happen only when the content hash changed.
 * - A mirror the user deleted twice in a day stays deleted until the source
 *   changes.
 */
export function plan(
  event: NormalizedEvent,
  rule: RuleConfig,
  mirror: MirrorState | null,
  ctx: PlanContext,
): Decision {
  if (event.origin) return { type: "skip", reason: "loop_guard" };

  const instanceOf: InstanceRef | undefined =
    event.recurringEventId && event.originalStartTime
      ? { masterSourceEventId: event.recurringEventId, originalStartTime: event.originalStartTime }
      : undefined;
  const live = mirror && !mirror.deletedAt ? mirror : null;
  const exclusion = exclusionReason(event, rule);

  if (exclusion) {
    if (live) return { type: "delete", targetEventId: live.targetEventId, instanceOf, reason: exclusion };
    if (instanceOf && !mirror) {
      return { type: "delete", targetEventId: null, instanceOf, reason: exclusion };
    }
    return { type: "skip", reason: "filtered" };
  }

  const position = windowPosition(event, syncWindow(ctx.now, rule.pastDays, rule.futureDays));
  if (position === "past") return { type: "skip", reason: "outside_window" };
  if (position === "future") {
    return live
      ? { type: "delete", targetEventId: live.targetEventId, instanceOf, reason: "outside_window" }
      : { type: "skip", reason: "outside_window" };
  }

  const input = buildMirrorInput(event, rule, ctx);
  const hash = hashMirror(input);

  if (!mirror) return { type: "create", input, hash, instanceOf };
  if (mirror.deletedAt) {
    if (mirror.contentHash !== REMOVED_HASH && mirror.contentHash === hash) {
      return { type: "skip", reason: "user_deleted" };
    }
    return { type: "create", input, hash, instanceOf };
  }
  if (mirror.contentHash === hash) return { type: "skip", reason: "unchanged" };
  return { type: "update", input, hash, targetEventId: mirror.targetEventId, instanceOf };
}
