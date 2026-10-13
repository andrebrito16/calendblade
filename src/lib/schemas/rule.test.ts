import { describe, expect, it } from "vitest";
import { createRuleSchema, ruleDefaults } from "./rule";

const valid = {
  ...ruleDefaults,
  sourceAccountId: "a",
  sourceCalendarId: "cal-1",
  targetAccountId: "b",
  targetCalendarId: "cal-2",
};

describe("createRuleSchema", () => {
  it("accepts a complete rule", () => {
    expect(createRuleSchema.parse(valid)).toMatchObject({ mode: "busy", pastDays: 7, futureDays: 90 });
  });

  it("rejects the same calendar as source and target", () => {
    const result = createRuleSchema.safeParse({ ...valid, targetCalendarId: "cal-1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ["targetCalendarId"],
      message: "rules.form.sameCalendar",
    });
  });

  it("validates the window bounds with translatable messages", () => {
    const result = createRuleSchema.safeParse({ ...valid, pastDays: 31, futureDays: 2 });
    expect(result.error?.issues.map((issue) => issue.message).sort()).toEqual([
      "errors.futureDaysRange",
      "errors.pastDaysRange",
    ]);
  });

  it("limits title lengths and color ids", () => {
    expect(createRuleSchema.safeParse({ ...valid, busyTitle: "x".repeat(61) }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, colorId: "12" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, colorId: "11" }).success).toBe(true);
  });
});
