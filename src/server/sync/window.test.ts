import { describe, expect, it } from "vitest";
import { event, NOW } from "../../../tests/support/factories";
import { syncWindow, toInstant, unionWindow, windowPosition } from "./window";

describe("sync window", () => {
  const window = syncWindow(NOW, 7, 90);

  it("spans past and future days around now", () => {
    expect(window.start.toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(window.end.toISOString()).toBe("2027-01-11T12:00:00.000Z");
  });

  it("classifies events", () => {
    expect(windowPosition(event(), window)).toBe("inside");
    expect(
      windowPosition(
        event({ start: { dateTime: "2026-09-01T10:00:00Z" }, end: { dateTime: "2026-09-01T11:00:00Z" } }),
        window,
      ),
    ).toBe("past");
    expect(
      windowPosition(
        event({ start: { dateTime: "2027-02-01T10:00:00Z" }, end: { dateTime: "2027-02-01T11:00:00Z" } }),
        window,
      ),
    ).toBe("future");
  });

  it("treats all-day dates as UTC midnight", () => {
    expect(toInstant({ date: "2026-10-20" })?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it("unions the windows of rules sharing a source", () => {
    const union = unionWindow([syncWindow(NOW, 7, 30), syncWindow(NOW, 2, 90)]);
    expect(union).toEqual(syncWindow(NOW, 7, 90));
  });
});
