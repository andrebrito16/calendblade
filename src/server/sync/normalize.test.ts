import { describe, expect, it } from "vitest";
import { normalizeGoogleEvent } from "./normalize";

describe("normalizeGoogleEvent", () => {
  it("maps a Google event to the provider-agnostic shape", () => {
    const normalized = normalizeGoogleEvent({
      id: "abc",
      iCalUID: "abc@google.com",
      status: "confirmed",
      summary: "Standup",
      start: { dateTime: "2026-10-14T09:30:00-03:00", timeZone: "America/Sao_Paulo" },
      end: { dateTime: "2026-10-14T09:45:00-03:00", timeZone: "America/Sao_Paulo" },
      attendees: [
        { email: "me@example.com", self: true, responseStatus: "tentative" },
        { email: "room@resource.example.com", resource: true },
        { email: "ana@example.com", displayName: "Ana", responseStatus: "accepted" },
      ],
      organizer: { email: "boss@example.com" },
      recurrence: ["RRULE:FREQ=DAILY"],
    });
    expect(normalized).toMatchObject({
      id: "abc",
      title: "Standup",
      allDay: false,
      selfResponse: "tentative",
      transparency: "opaque",
      visibility: "default",
      organizerIsSelf: false,
      recurrence: ["RRULE:FREQ=DAILY"],
      origin: null,
    });
    expect(normalized.attendees).toEqual([{ email: "ana@example.com", name: "Ana", response: "accepted" }]);
  });

  it("detects all-day events and reads the loop-guard origin", () => {
    const normalized = normalizeGoogleEvent({
      id: "x",
      start: { date: "2026-10-20" },
      end: { date: "2026-10-21" },
      extendedProperties: { private: { "calendblade.origin": "rule-9", "calendblade.source": "src-1" } },
    });
    expect(normalized.allDay).toBe(true);
    expect(normalized.title).toBe("");
    expect(normalized.origin).toEqual({ app: "calendblade", ruleId: "rule-9", sourceEventId: "src-1" });
  });

  it("keeps cancelled tombstones from incremental sync", () => {
    expect(normalizeGoogleEvent({ id: "gone", status: "cancelled" }).status).toBe("cancelled");
  });
});
