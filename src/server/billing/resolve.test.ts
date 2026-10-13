import { describe, expect, it } from "vitest";
import { resolveEntitlements, type SubscriptionSnapshot, trialDaysLeft } from "./resolve";

const now = new Date("2026-10-13T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const sub = (overrides: Partial<SubscriptionSnapshot>): SubscriptionSnapshot => ({
  plan: "pro",
  status: "active",
  stripeSubscriptionId: "sub_1",
  trialEnd: null,
  periodEnd: new Date(now.getTime() + 20 * day),
  cancelAtPeriodEnd: false,
  ...overrides,
});
const resolve = (subs: SubscriptionSnapshot[], billingEnabled = true) =>
  resolveEntitlements(subs, { billingEnabled, now });

describe("resolveEntitlements", () => {
  it("self-host mode is unlimited", () => {
    const result = resolve([], false);
    expect(result).toMatchObject({ plan: "max", canSync: true, billingEnabled: false });
    expect(result.maxCalendars).toBe(Number.POSITIVE_INFINITY);
    expect(result.maxRules).toBe(Number.POSITIVE_INFINITY);
  });

  it("never subscribed → none, nothing allowed", () => {
    expect(resolve([])).toMatchObject({ plan: "none", canSync: false, maxCalendars: 0, maxRules: 0 });
    expect(resolve([sub({ status: "incomplete" })]).plan).toBe("none");
  });

  it("trialing Pro → 2 calendars, 2 rules", () => {
    const trialEnd = new Date(now.getTime() + 5 * day);
    expect(resolve([sub({ status: "trialing", trialEnd })])).toMatchObject({
      plan: "trial",
      planId: "pro",
      maxCalendars: 2,
      maxRules: 2,
      canSync: true,
      trialEndsAt: trialEnd,
    });
  });

  it("trialing Max → still 2 calendars, unlimited rules", () => {
    const result = resolve([sub({ plan: "max", status: "trialing" })]);
    expect(result).toMatchObject({ plan: "trial", planId: "max", maxCalendars: 2 });
    expect(result.maxRules).toBe(Number.POSITIVE_INFINITY);
  });

  it("active plans use their own limits", () => {
    expect(resolve([sub({ plan: "pro" })])).toMatchObject({ plan: "pro", maxCalendars: 2, maxRules: 2 });
    expect(resolve([sub({ plan: "max" })])).toMatchObject({ plan: "max", maxCalendars: 15 });
  });

  it("past_due within the 7-day grace keeps access and flags it", () => {
    const periodEnd = new Date(now.getTime() - 3 * day);
    expect(resolve([sub({ status: "past_due", periodEnd })])).toMatchObject({
      plan: "pro",
      pastDue: true,
      canSync: true,
    });
  });

  it("past_due beyond the grace period is paused", () => {
    const periodEnd = new Date(now.getTime() - 8 * day);
    expect(resolve([sub({ status: "past_due", periodEnd })])).toMatchObject({
      plan: "paused",
      canSync: false,
    });
  });

  it("canceled → paused", () => {
    expect(resolve([sub({ status: "canceled" })])).toMatchObject({ plan: "paused", canSync: false });
  });

  it("prefers the live subscription over old ones", () => {
    expect(resolve([sub({ status: "canceled" }), sub({ plan: "max", status: "active" })]).plan).toBe("max");
  });

  it("reports scheduled cancellation", () => {
    expect(resolve([sub({ cancelAtPeriodEnd: true })]).cancelAtPeriodEnd).toBe(true);
  });
});

describe("trialDaysLeft", () => {
  it("rounds up partial days and never goes negative", () => {
    expect(trialDaysLeft(new Date(now.getTime() + 4.2 * day), now)).toBe(5);
    expect(trialDaysLeft(new Date(now.getTime() - day), now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBe(0);
  });
});
