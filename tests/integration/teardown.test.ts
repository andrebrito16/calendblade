import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { calendarConnection, eventMirror, syncRule, user } from "@/server/db/schema";
import { syncSourceCalendar } from "@/server/sync/run";
import { teardownConnection, teardownRule } from "@/server/sync/teardown";
import { calendarId, connectFixture, createRule, createUser, mirrorsOf, NOW, resetAll } from "./helpers";

beforeEach(resetAll);

const far = () => Date.now() + 60_000;

async function setup() {
  const owner = await createUser();
  const work = await connectFixture(owner.id, "fixture-work");
  const personal = await connectFixture(owner.id, "fixture-personal");
  const workCal = await calendarId(work.id, "alex@work.example.com");
  const personalCal = await calendarId(personal.id, "alex.rivera@example.com");
  const rule = await createRule(owner.id, workCal, personalCal);
  await syncSourceCalendar(workCal, { trigger: "initial", now: NOW });
  return { owner, work, personal, rule };
}

describe("teardown", () => {
  it("deletes a rule and, when asked, its mirrors in the target", async () => {
    const env = await setup();
    expect(mirrorsOf("fixture-personal", "alex.rivera@example.com", env.rule.id).length).toBeGreaterThan(0);
    expect(await teardownRule(env.rule.id, { deleteMirrors: true, deadline: far() })).toBe("done");
    expect(mirrorsOf("fixture-personal", "alex.rivera@example.com", env.rule.id)).toHaveLength(0);
    expect(await db.query.syncRule.findFirst({ where: eq(syncRule.id, env.rule.id) })).toBeUndefined();
  });

  it("keeps mirrors when not asked to delete them", async () => {
    const env = await setup();
    const count = mirrorsOf("fixture-personal", "alex.rivera@example.com", env.rule.id).length;
    await teardownRule(env.rule.id, { deleteMirrors: false, deadline: far() });
    expect(mirrorsOf("fixture-personal", "alex.rivera@example.com", env.rule.id)).toHaveLength(count);
  });

  it("removes mirrors but keeps the rule for the paused-account cleanup", async () => {
    const env = await setup();
    await teardownRule(env.rule.id, { deleteMirrors: true, keepRule: true, deadline: far() });
    expect(await db.query.syncRule.findFirst({ where: eq(syncRule.id, env.rule.id) })).toBeDefined();
    const live = await db.query.eventMirror.findMany({ where: eq(eventMirror.ruleId, env.rule.id) });
    expect(live.every((row) => row.deletedAt)).toBe(true);
  });

  it("stops at the deadline and resumes later", async () => {
    const env = await setup();
    expect(await teardownRule(env.rule.id, { deleteMirrors: true, deadline: Date.now() - 1 })).toBe(
      "partial",
    );
    expect(await teardownRule(env.rule.id, { deleteMirrors: true, deadline: far() })).toBe("done");
  });

  it("disconnecting an account removes its rules, mirrors and the connection", async () => {
    const env = await setup();
    // Mark as being disconnected, like the Server Action does.
    await db
      .update(calendarConnection)
      .set({ status: "revoked" })
      .where(eq(calendarConnection.id, env.personal.id));
    expect(await teardownConnection(env.personal.id, { deleteMirrors: true, deadline: far() })).toBe("done");
    expect(mirrorsOf("fixture-personal", "alex.rivera@example.com")).toHaveLength(0);
    expect(
      await db.query.calendarConnection.findFirst({ where: eq(calendarConnection.id, env.personal.id) }),
    ).toBeUndefined();
    expect(await db.query.syncRule.findFirst({ where: eq(syncRule.id, env.rule.id) })).toBeUndefined();
  });

  it("deletes a user pending deletion after the last connection is gone", async () => {
    const env = await setup();
    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, env.owner.id));
    await teardownConnection(env.work.id, { deleteMirrors: false, deadline: far() });
    expect(await db.query.user.findFirst({ where: eq(user.id, env.owner.id) })).toBeDefined();
    await teardownConnection(env.personal.id, { deleteMirrors: false, deadline: far() });
    expect(await db.query.user.findFirst({ where: eq(user.id, env.owner.id) })).toBeUndefined();
  });
});
