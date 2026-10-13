import { describe, expect, it } from "vitest";
import { hashMirror } from "./hash";

const base = {
  title: "Busy",
  start: { dateTime: "2026-10-14T13:00:00Z" },
  end: { dateTime: "2026-10-14T14:00:00Z" },
  allDay: false,
  transparency: "opaque" as const,
  visibility: "private" as const,
  origin: { ruleId: "r", sourceEventId: "s" },
};

describe("hashMirror", () => {
  it("is stable regardless of key order and undefined fields", () => {
    const reordered = {
      origin: base.origin,
      visibility: base.visibility,
      transparency: base.transparency,
      allDay: false,
      end: base.end,
      start: base.start,
      title: "Busy",
      description: undefined,
    };
    expect(hashMirror(reordered)).toBe(hashMirror(base));
  });

  it("changes when written content changes", () => {
    expect(hashMirror({ ...base, title: "Out" })).not.toBe(hashMirror(base));
    expect(hashMirror({ ...base, end: { dateTime: "2026-10-14T15:00:00Z" } })).not.toBe(hashMirror(base));
  });
});
