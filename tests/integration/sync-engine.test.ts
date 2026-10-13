import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { calendarConnection, eventMirror, syncRule, syncRun } from "@/server/db/schema";
import { expireSyncTokens, putEvent, revokeFixtureAccount } from "@/server/providers/fixture/store";
import { syncSourceCalendar } from "@/server/sync/run";
import {
  calendarId,
  connectFixture,
  createRule,
  createUser,
  liveEvents,
  mirrorsOf,
  NOW,
  resetAll,
  writeCount,
} from "./helpers";

const WORK = { account: "fixture-work", calendar: "alex@work.example.com" };
const PERSONAL = { account: "fixture-personal", calendar: "alex.rivera@example.com" };
const FAMILY = { account: "fixture-personal", calendar: "family@group.example.com" };

async function setup() {
  const owner = await createUser();
  const work = await connectFixture(owner.id, WORK.account);
  const personal = await connectFixture(owner.id, PERSONAL.account);
  return {
    owner,
    work,
    personal,
    workCal: await calendarId(work.id, WORK.calendar),
    personalCal: await calendarId(personal.id, PERSONAL.calendar),
    familyCal: await calendarId(personal.id, FAMILY.calendar),
  };
}

const sync = (calendar: string, opts: { full?: boolean; now?: Date } = {}) =>
  syncSourceCalendar(calendar, { trigger: "manual", now: NOW, ...opts });

beforeEach(resetAll);

describe("sync engine (fixture provider, real Postgres)", () => {
  it("creates full-detail mirrors with guests as text and no attendees", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal, {
      mode: "full",
      titlePrefix: "[Work]",
    });
    await sync(env.workCal);

    const mirrors = mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id);
    const planning = mirrors.find((event) => event.origin?.sourceEventId === "work-planning");
    expect(planning?.title).toBe("[Work] Quarterly planning");
    expect(planning?.location).toBe("Room 4B");
    expect(planning?.description).toContain("Guests:\n• Priya <priya@example.com>");
    expect(planning?.attendees).toEqual([]);
    // declined, transparent ("free") and cancelled sources are not mirrored
    const sources = mirrors.map((event) => event.origin?.sourceEventId);
    expect(sources).not.toContain("work-vendor");
    expect(sources).not.toContain("work-focus");
    expect(sources).not.toContain("work-cancelled");
  });

  it("creates busy blockers without details", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal);
    await sync(env.workCal);
    const mirrors = mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id);
    expect(mirrors.length).toBeGreaterThan(0);
    for (const mirror of mirrors) {
      expect(mirror).toMatchObject({ title: "Busy", visibility: "private", transparency: "opaque" });
      expect(mirror.description).toBeUndefined();
      expect(mirror.location).toBeUndefined();
    }
  });

  it("writes nothing when nothing changed", async () => {
    const env = await setup();
    await createRule(env.owner.id, env.workCal, env.personalCal, { mode: "full" });
    await sync(env.workCal);
    const before = writeCount(PERSONAL.account, PERSONAL.calendar);
    await sync(env.workCal, { full: true });
    expect(writeCount(PERSONAL.account, PERSONAL.calendar)).toBe(before);
  });

  it("updates, then deletes mirrors when the source changes or is cancelled", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal, { mode: "full" });
    await sync(env.workCal);
    const original = liveEvents(WORK.account, WORK.calendar).find((event) => event.id === "work-1on1");
    if (!original) throw new Error("fixture missing");

    putEvent(WORK.account, WORK.calendar, { ...original, title: "1:1 moved" });
    await sync(env.workCal);
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).find(
        (e) => e.origin?.sourceEventId === "work-1on1",
      )?.title,
    ).toBe("1:1 moved");

    putEvent(WORK.account, WORK.calendar, { ...original, status: "cancelled" });
    await sync(env.workCal);
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-1on1",
      ),
    ).toBe(false);
  });

  it("deletes mirrors when the source is declined", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal);
    await sync(env.workCal);
    const original = liveEvents(WORK.account, WORK.calendar).find((event) => event.id === "work-1on1");
    if (!original) throw new Error("fixture missing");
    putEvent(WORK.account, WORK.calendar, { ...original, selfResponse: "declined" });
    await sync(env.workCal);
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-1on1",
      ),
    ).toBe(false);
  });

  it("removes mirrors filtered out by a rule edit", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal);
    await sync(env.workCal);
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-offsite",
      ),
    ).toBe(true);

    await db.update(syncRule).set({ includeAllDay: false }).where(eq(syncRule.id, rule.id));
    await sync(env.workCal, { full: true });
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-offsite",
      ),
    ).toBe(false);
  });

  it("never re-mirrors mirrors in a two-way setup (loop guard)", async () => {
    const env = await setup();
    const there = await createRule(env.owner.id, env.workCal, env.personalCal);
    const back = await createRule(env.owner.id, env.personalCal, env.workCal, { mode: "full" });
    await sync(env.workCal);
    await sync(env.personalCal);
    await sync(env.workCal);
    await sync(env.personalCal);

    const personalOriginals = liveEvents(PERSONAL.account, PERSONAL.calendar).filter((e) => !e.origin).length;
    const workOriginals = liveEvents(WORK.account, WORK.calendar).filter((e) => !e.origin).length;
    // B→A only mirrors B's originals; A→B only A's. No mirror of a mirror.
    expect(mirrorsOf(WORK.account, WORK.calendar, back.id).length).toBeLessThanOrEqual(personalOriginals);
    expect(mirrorsOf(PERSONAL.account, PERSONAL.calendar, there.id).length).toBeLessThanOrEqual(
      workOriginals,
    );
    expect(mirrorsOf(WORK.account, WORK.calendar).every((e) => e.origin?.ruleId === back.id)).toBe(true);
    expect(mirrorsOf(PERSONAL.account, PERSONAL.calendar).every((e) => e.origin?.ruleId === there.id)).toBe(
      true,
    );
  });

  it("keeps two rules into the same target independent", async () => {
    const env = await setup();
    const fromWork = await createRule(env.owner.id, env.workCal, env.familyCal);
    const fromPersonal = await createRule(env.owner.id, env.personalCal, env.familyCal);
    await sync(env.workCal);
    await sync(env.personalCal);
    const personalMirrors = mirrorsOf(FAMILY.account, FAMILY.calendar, fromPersonal.id).length;
    expect(personalMirrors).toBeGreaterThan(0);

    await sync(env.workCal, { full: true });
    expect(mirrorsOf(FAMILY.account, FAMILY.calendar, fromPersonal.id)).toHaveLength(personalMirrors);
    expect(mirrorsOf(FAMILY.account, FAMILY.calendar, fromWork.id).length).toBeGreaterThan(0);
  });

  it("mirrors recurring masters with recurrence and patches the right occurrence", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal, { mode: "full" });
    await sync(env.workCal);
    const masterRow = await db.query.eventMirror.findFirst({
      where: eq(eventMirror.sourceEventId, "work-standup"),
    });
    const master = liveEvents(PERSONAL.account, PERSONAL.calendar).find(
      (e) => e.id === masterRow?.targetEventId,
    );
    expect(master?.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]);

    const moved = await db.query.eventMirror.findFirst({
      where: eq(eventMirror.sourceEventId, "work-standup_moved"),
    });
    expect(moved?.targetEventId.startsWith(`${masterRow?.targetEventId}_`)).toBe(true);
    const occurrence = liveEvents(PERSONAL.account, PERSONAL.calendar).find(
      (e) => e.id === moved?.targetEventId,
    );
    expect(occurrence).toMatchObject({
      title: "Team standup (moved)",
      recurringEventId: masterRow?.targetEventId,
    });

    // The cancelled occurrence is cancelled inside the target series, not mirrored standalone.
    const cancelled = await db.query.eventMirror.findFirst({
      where: eq(eventMirror.sourceEventId, "work-standup_cancelled"),
    });
    expect(cancelled?.deletedAt).not.toBeNull();
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).filter(
        (e) => e.title.startsWith("Team standup") && !e.recurringEventId,
      ),
    ).toHaveLength(1);
  });

  it("recovers from an expired sync token without duplicating mirrors", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal);
    await sync(env.workCal);
    const count = mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).length;

    // Simulate a crash that lost our bookkeeping, then a 410 from the provider.
    await db.delete(eventMirror).where(eq(eventMirror.ruleId, rule.id));
    expireSyncTokens(WORK.account, WORK.calendar);
    const result = await sync(env.workCal);

    expect(result.status).toBe("done");
    expect(mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id)).toHaveLength(count);
  });

  it("flags the connection, pauses its rules and emails once when the token is revoked", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal);
    await sync(env.workCal);
    revokeFixtureAccount(WORK.account);

    await sync(env.workCal);
    const connection = await db.query.calendarConnection.findFirst({
      where: eq(calendarConnection.id, env.work.id),
    });
    expect(connection?.status).toBe("needs_reauth");
    expect(connection?.reauthEmailSentAt).not.toBeNull();
    const pausedRule = await db.query.syncRule.findFirst({ where: eq(syncRule.id, rule.id) });
    expect(pausedRule).toMatchObject({ status: "paused", statusReason: "connection_needs_reauth" });

    const sentAt = connection?.reauthEmailSentAt;
    await db.update(syncRule).set({ status: "active" }).where(eq(syncRule.id, rule.id));
    await db
      .update(calendarConnection)
      .set({ status: "active" })
      .where(eq(calendarConnection.id, env.work.id));
    await sync(env.workCal);
    const again = await db.query.calendarConnection.findFirst({
      where: eq(calendarConnection.id, env.work.id),
    });
    expect(again?.reauthEmailSentAt?.getTime()).toBe(sentAt?.getTime());
  });

  it("advances the window: events newly inside the future edge get mirrored", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal, { futureDays: 90 });
    await sync(env.workCal);
    // "Annual review" is 120 days out.
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-far",
      ),
    ).toBe(false);
    await sync(env.workCal, { full: true, now: new Date(NOW.getTime() + 35 * 24 * 3600_000) });
    expect(
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-far",
      ),
    ).toBe(true);
  });

  it("recreates a mirror the user deleted once, then respects a second deletion", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal, { mode: "full" });
    await sync(env.workCal);
    const source = () => liveEvents(WORK.account, WORK.calendar).find((event) => event.id === "work-1on1");
    const userDeletes = async () => {
      const row = await db.query.eventMirror.findFirst({ where: eq(eventMirror.sourceEventId, "work-1on1") });
      const target = liveEvents(PERSONAL.account, PERSONAL.calendar).find((e) => e.id === row?.targetEventId);
      if (target) putEvent(PERSONAL.account, PERSONAL.calendar, { ...target, status: "cancelled" });
    };
    const has1on1 = () =>
      mirrorsOf(PERSONAL.account, PERSONAL.calendar, rule.id).some(
        (e) => e.origin?.sourceEventId === "work-1on1",
      );

    await userDeletes();
    putEvent(WORK.account, WORK.calendar, { ...source()!, title: "edit 1" });
    await sync(env.workCal);
    expect(has1on1()).toBe(true);

    await userDeletes();
    putEvent(WORK.account, WORK.calendar, { ...source()!, title: "edit 2" });
    await sync(env.workCal);
    expect(has1on1()).toBe(false);
  });

  it("logs a run per rule with counters and skips inactive rules", async () => {
    const env = await setup();
    const rule = await createRule(env.owner.id, env.workCal, env.personalCal);
    const paused = await createRule(env.owner.id, env.workCal, env.familyCal, { status: "paused" });
    await sync(env.workCal);
    const runs = await db.query.syncRun.findMany({ where: eq(syncRun.ruleId, rule.id) });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "succeeded", trigger: "manual" });
    expect(runs[0]?.createdCount).toBeGreaterThan(0);
    expect(await db.query.syncRun.findMany({ where: eq(syncRun.ruleId, paused.id) })).toHaveLength(0);
  });
});
