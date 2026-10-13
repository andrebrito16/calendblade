import type { NormalizedEvent } from "@/server/providers/types";
import type { RuleConfig } from "@/server/sync/plan";

export const NOW = new Date("2026-10-13T12:00:00Z");

export function event(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: "evt-1",
    icalUid: "evt-1@example.com",
    status: "confirmed",
    title: "Quarterly planning",
    description: "Bring drafts.",
    location: "Room 4B",
    start: { dateTime: "2026-10-14T13:00:00Z", timeZone: "UTC" },
    end: { dateTime: "2026-10-14T14:00:00Z", timeZone: "UTC" },
    allDay: false,
    transparency: "opaque",
    visibility: "default",
    selfResponse: "accepted",
    attendees: [
      { email: "ana@example.com", name: "Ana", response: "accepted" },
      { email: "ben@example.com", response: "tentative" },
    ],
    organizerIsSelf: true,
    origin: null,
    ...overrides,
  };
}

export function rule(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return {
    id: "rule-1",
    mode: "full",
    busyTitle: null,
    titlePrefix: null,
    colorId: null,
    includeAllDay: true,
    includeDeclined: false,
    includeTentative: true,
    includePrivate: true,
    pastDays: 7,
    futureDays: 90,
    ...overrides,
  };
}

export const ctx = { now: NOW, busyTitle: "Busy", attendeesHeading: "Guests" };
