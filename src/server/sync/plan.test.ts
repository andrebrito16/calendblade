import { describe, expect, it } from "vitest";
import { ctx, event, rule } from "../../../tests/support/factories";
import { hashMirror } from "./hash";
import { buildMirrorInput, exclusionReason, plan, REMOVED_HASH } from "./plan";

describe("buildMirrorInput", () => {
  it("full mode copies details and appends guests as text, never attendees", () => {
    const input = buildMirrorInput(event(), rule({ titlePrefix: "[Work]", colorId: "6" }), ctx);
    expect(input.title).toBe("[Work] Quarterly planning");
    expect(input.location).toBe("Room 4B");
    expect(input.description).toBe("Bring drafts.\n\nGuests:\n• Ana <ana@example.com>\n• ben@example.com");
    expect(input.colorId).toBe("6");
    expect(input).not.toHaveProperty("attendees");
    expect(input.origin).toEqual({ ruleId: "rule-1", sourceEventId: "evt-1" });
  });

  it("busy mode carries times only, private and opaque, with the localized title", () => {
    const input = buildMirrorInput(event(), rule({ mode: "busy" }), ctx);
    expect(input).toMatchObject({ title: "Busy", visibility: "private", transparency: "opaque" });
    expect(input.description).toBeUndefined();
    expect(input.location).toBeUndefined();
    expect(input.start).toEqual(event().start);
  });

  it("busy mode honors the per-rule title override", () => {
    expect(buildMirrorInput(event(), rule({ mode: "busy", busyTitle: " Out " }), ctx).title).toBe("Out");
  });

  it("keeps recurrence on masters and drops it on occurrences", () => {
    const master = event({ recurrence: ["RRULE:FREQ=WEEKLY"] });
    expect(buildMirrorInput(master, rule(), ctx).recurrence).toEqual(["RRULE:FREQ=WEEKLY"]);
    const occurrence = event({ recurringEventId: "m", recurrence: ["RRULE:FREQ=WEEKLY"] });
    expect(buildMirrorInput(occurrence, rule(), ctx).recurrence).toBeUndefined();
  });
});

describe("exclusionReason", () => {
  it.each([
    ["cancelled", event({ status: "cancelled" }), rule()],
    ["transparent", event({ transparency: "transparent" }), rule({ includeDeclined: true })],
    ["declined", event({ selfResponse: "declined" }), rule()],
    ["tentative", event({ selfResponse: "tentative" }), rule({ includeTentative: false })],
    ["all_day", event({ allDay: true }), rule({ includeAllDay: false })],
    ["private", event({ visibility: "confidential" }), rule({ includePrivate: false })],
  ])("%s", (reason, source, config) => {
    expect(exclusionReason(source, config)).toBe(reason);
  });

  it("includes declined/tentative/private/all-day when the rule asks to", () => {
    const config = rule({
      includeDeclined: true,
      includeTentative: true,
      includePrivate: true,
      includeAllDay: true,
    });
    expect(exclusionReason(event({ selfResponse: "declined" }), config)).toBeNull();
    expect(exclusionReason(event({ visibility: "private", allDay: true }), config)).toBeNull();
  });
});

describe("plan", () => {
  it("never mirrors a mirror (loop guard)", () => {
    const mirrored = event({ origin: { app: "calendblade", ruleId: "other", sourceEventId: "x" } });
    expect(plan(mirrored, rule(), null, ctx)).toEqual({ type: "skip", reason: "loop_guard" });
  });

  it("creates a new mirror", () => {
    const decision = plan(event(), rule(), null, ctx);
    expect(decision.type).toBe("create");
  });

  it("skips writes when the content hash is unchanged", () => {
    const hash = hashMirror(buildMirrorInput(event(), rule(), ctx));
    const decision = plan(event(), rule(), { targetEventId: "t1", contentHash: hash, deletedAt: null }, ctx);
    expect(decision).toEqual({ type: "skip", reason: "unchanged" });
  });

  it("updates when the content changed", () => {
    const decision = plan(
      event({ title: "Renamed" }),
      rule(),
      { targetEventId: "t1", contentHash: "old", deletedAt: null },
      ctx,
    );
    expect(decision).toMatchObject({ type: "update", targetEventId: "t1" });
  });

  it("busy mode ignores title changes (no write)", () => {
    const config = rule({ mode: "busy" });
    const hash = hashMirror(buildMirrorInput(event(), config, ctx));
    const decision = plan(
      event({ title: "Secret renamed" }),
      config,
      { targetEventId: "t1", contentHash: hash, deletedAt: null },
      ctx,
    );
    expect(decision).toEqual({ type: "skip", reason: "unchanged" });
  });

  it.each([
    ["cancelled", event({ status: "cancelled" })],
    ["declined", event({ selfResponse: "declined" })],
  ])("deletes the mirror when the source is %s", (reason, source) => {
    const decision = plan(source, rule(), { targetEventId: "t1", contentHash: "h", deletedAt: null }, ctx);
    expect(decision).toEqual({ type: "delete", targetEventId: "t1", instanceOf: undefined, reason });
  });

  it("deletes the mirror when a rule edit filters the event out", () => {
    const decision = plan(
      event({ allDay: true }),
      rule({ includeAllDay: false }),
      { targetEventId: "t1", contentHash: "h", deletedAt: null },
      ctx,
    );
    expect(decision).toMatchObject({ type: "delete", reason: "all_day" });
  });

  it("cancels a single occurrence in the target series when an exception is cancelled", () => {
    const occurrence = event({
      id: "m_1",
      status: "cancelled",
      recurringEventId: "m",
      originalStartTime: { dateTime: "2026-10-15T09:00:00Z" },
    });
    expect(plan(occurrence, rule(), null, ctx)).toEqual({
      type: "delete",
      targetEventId: null,
      instanceOf: { masterSourceEventId: "m", originalStartTime: { dateTime: "2026-10-15T09:00:00Z" } },
      reason: "cancelled",
    });
  });

  it("patches an occurrence of the mirrored series on create", () => {
    const occurrence = event({
      id: "m_1",
      recurringEventId: "m",
      originalStartTime: { dateTime: "2026-10-15T09:00:00Z" },
    });
    expect(plan(occurrence, rule(), null, ctx)).toMatchObject({
      type: "create",
      instanceOf: { masterSourceEventId: "m" },
    });
  });

  it("leaves mirrors alone once events leave the window into the past", () => {
    const old = event({
      start: { dateTime: "2026-09-01T10:00:00Z" },
      end: { dateTime: "2026-09-01T11:00:00Z" },
    });
    expect(plan(old, rule(), { targetEventId: "t1", contentHash: "h", deletedAt: null }, ctx)).toEqual({
      type: "skip",
      reason: "outside_window",
    });
  });

  it("removes the mirror when an event moves beyond the future edge", () => {
    const far = event({
      start: { dateTime: "2027-06-01T10:00:00Z" },
      end: { dateTime: "2027-06-01T11:00:00Z" },
    });
    expect(plan(far, rule(), { targetEventId: "t1", contentHash: "h", deletedAt: null }, ctx)).toMatchObject({
      type: "delete",
      reason: "outside_window",
    });
    expect(plan(far, rule(), null, ctx)).toEqual({ type: "skip", reason: "outside_window" });
  });

  it("creates events newly inside the future edge as the window advances", () => {
    const later = event({
      start: { dateTime: "2027-01-12T10:00:00Z" },
      end: { dateTime: "2027-01-12T11:00:00Z" },
    });
    expect(plan(later, rule(), null, ctx).type).toBe("skip");
    expect(plan(later, rule(), null, { ...ctx, now: new Date("2026-10-16T12:00:00Z") }).type).toBe("create");
  });

  it("keeps recurring masters that started before the window", () => {
    const master = event({
      start: { dateTime: "2025-01-01T09:00:00Z" },
      end: { dateTime: "2025-01-01T09:15:00Z" },
      recurrence: ["RRULE:FREQ=DAILY"],
    });
    expect(plan(master, rule(), null, ctx).type).toBe("create");
  });

  it("respects a mirror the user deleted (same content) but recreates after the source changes", () => {
    const hash = hashMirror(buildMirrorInput(event(), rule(), ctx));
    const userDeleted = { targetEventId: "t1", contentHash: hash, deletedAt: new Date() };
    expect(plan(event(), rule(), userDeleted, ctx)).toEqual({ type: "skip", reason: "user_deleted" });
    expect(plan(event({ title: "Changed" }), rule(), userDeleted, ctx).type).toBe("create");
  });

  it("recreates mirrors removed by the engine once the event qualifies again", () => {
    const removed = { targetEventId: "t1", contentHash: REMOVED_HASH, deletedAt: new Date() };
    expect(plan(event(), rule(), removed, ctx).type).toBe("create");
  });
});
