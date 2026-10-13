import type { AccessRole, NormalizedEvent } from "../types";

export type FixtureCalendarSeed = {
  id: string;
  name: string;
  color: string;
  accessRole: AccessRole;
  isPrimary?: boolean;
  events: (base: Date) => NormalizedEvent[];
};

export type FixtureAccountSeed = {
  id: string;
  email: string;
  name: string;
  calendars: FixtureCalendarSeed[];
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(base: Date, dayOffset: number, hour: number, minute = 0) {
  return new Date(base.getTime() + dayOffset * DAY + hour * HOUR + minute * 60_000);
}

function dateOnly(base: Date, dayOffset: number) {
  return new Date(base.getTime() + dayOffset * DAY).toISOString().slice(0, 10);
}

function timed(
  id: string,
  title: string,
  start: Date,
  minutes: number,
  extra: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id,
    icalUid: `${id}@fixture.example.com`,
    status: "confirmed",
    title,
    start: { dateTime: start.toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(start.getTime() + minutes * 60_000).toISOString(), timeZone: "UTC" },
    allDay: false,
    transparency: "opaque",
    visibility: "default",
    selfResponse: "accepted",
    attendees: [],
    organizerIsSelf: true,
    origin: null,
    ...extra,
  };
}

function allDay(
  id: string,
  title: string,
  base: Date,
  dayOffset: number,
  days: number,
  extra: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    ...timed(id, title, base, 0, extra),
    start: { date: dateOnly(base, dayOffset) },
    end: { date: dateOnly(base, dayOffset + days) },
    allDay: true,
    ...extra,
  };
}

const guests = (...names: string[]) =>
  names.map((name) => ({
    email: `${name.toLowerCase()}@example.com`,
    name,
    response: "accepted" as const,
  }));

/**
 * Scripted fixture accounts covering the sync engine's scenarios: recurring
 * series with a moved and a cancelled occurrence, declined, tentative,
 * private, all-day, cancelled and "free" (transparent) events.
 */
export const fixtureAccounts: FixtureAccountSeed[] = [
  {
    id: "fixture-work",
    email: "alex@work.example.com",
    name: "Alex Rivera",
    calendars: [
      {
        id: "alex@work.example.com",
        name: "Work",
        color: "#4f46e5",
        accessRole: "owner",
        isPrimary: true,
        events: (base) => {
          const standupStart = at(base, -14, 9, 30);
          return [
            timed("work-standup", "Team standup", standupStart, 15, {
              recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
              attendees: guests("Jordan", "Priya", "Sam"),
            }),
            // Moved occurrence (exception) two days from now.
            timed("work-standup_moved", "Team standup (moved)", at(base, 2, 10, 30), 15, {
              recurringEventId: "work-standup",
              originalStartTime: { dateTime: at(base, 2, 9, 30).toISOString(), timeZone: "UTC" },
            }),
            // Cancelled occurrence five days from now.
            timed("work-standup_cancelled", "Team standup", at(base, 5, 9, 30), 15, {
              status: "cancelled",
              recurringEventId: "work-standup",
              originalStartTime: { dateTime: at(base, 5, 9, 30).toISOString(), timeZone: "UTC" },
            }),
            timed("work-1on1", "1:1 with Jordan", at(base, 1, 15), 30, {
              attendees: guests("Jordan"),
              description: "Career growth and Q4 goals.",
            }),
            timed("work-planning", "Quarterly planning", at(base, 3, 13), 120, {
              location: "Room 4B",
              description: "Bring your roadmap drafts.",
              attendees: guests("Priya", "Sam", "Chloe", "Ben"),
            }),
            timed("work-vendor", "Vendor demo", at(base, 2, 16), 45, { selfResponse: "declined" }),
            timed("work-design", "Design review", at(base, 4, 11), 60, {
              selfResponse: "tentative",
            }),
            timed("work-focus", "Focus time", at(base, 1, 9), 120, { transparency: "transparent" }),
            timed("work-interview", "Interview loop", at(base, 6, 14), 60, {
              visibility: "private",
            }),
            timed("work-cancelled", "Budget sync", at(base, 2, 14), 30, { status: "cancelled" }),
            allDay("work-offsite", "Company offsite", base, 10, 2, { location: "Lisbon" }),
            timed("work-past", "Retro", at(base, -3, 16), 60),
            timed("work-far", "Annual review", at(base, 120, 10), 60),
          ];
        },
      },
      {
        id: "holidays@work.example.com",
        name: "Team Holidays",
        color: "#16a34a",
        accessRole: "reader",
        events: (base) => [
          allDay("hol-priya", "Priya out of office", base, 7, 3),
          allDay("hol-sam", "Sam on parental leave", base, 20, 10),
        ],
      },
      {
        id: "launches@work.example.com",
        name: "Product Launches",
        color: "#ea580c",
        accessRole: "writer",
        events: (base) => [timed("launch-v2", "v2 launch window", at(base, 8, 17), 180)],
      },
    ],
  },
  {
    id: "fixture-personal",
    email: "alex.rivera@example.com",
    name: "Alex Rivera",
    calendars: [
      {
        id: "alex.rivera@example.com",
        name: "Personal",
        color: "#0891b2",
        accessRole: "owner",
        isPrimary: true,
        events: (base) => [
          timed("personal-dentist", "Dentist", at(base, 1, 8), 60, {
            visibility: "private",
            location: "Smile Dental, 5th Ave",
          }),
          timed("personal-dinner", "Dinner with Sam", at(base, 3, 19), 120, {
            location: "Osteria Nonna",
          }),
          timed("personal-yoga", "Yoga", at(base, -7, 7), 60, {
            recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU,TH"],
          }),
          allDay("personal-trip", "Weekend in the mountains", base, 12, 3),
          timed("personal-haircut", "Haircut", at(base, 9, 12), 45),
        ],
      },
      {
        id: "family@group.example.com",
        name: "Family",
        color: "#db2777",
        accessRole: "writer",
        events: (base) => [
          timed("family-pickup", "School pickup", at(base, -2, 15), 30, {
            recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=WE"],
          }),
          allDay("family-birthday", "Mom's birthday", base, 15, 1),
        ],
      },
      {
        id: "gym@example.com",
        name: "Gym",
        color: "#65a30d",
        accessRole: "owner",
        events: (base) => [timed("gym-pt", "Personal training", at(base, 2, 18), 60)],
      },
    ],
  },
  {
    id: "fixture-side",
    email: "alex@side.example.com",
    name: "Alex Rivera",
    calendars: [
      {
        id: "alex@side.example.com",
        name: "Consulting",
        color: "#7c3aed",
        accessRole: "owner",
        isPrimary: true,
        events: (base) => [
          timed("side-client", "Client kickoff", at(base, 4, 17), 60, {
            attendees: guests("Morgan"),
          }),
          timed("side-workshop", "Workshop prep", at(base, 11, 10), 90),
        ],
      },
    ],
  },
  {
    id: "fixture-studio",
    email: "alex@studio.example.com",
    name: "Alex Rivera",
    calendars: [
      {
        id: "alex@studio.example.com",
        name: "Studio",
        color: "#ca8a04",
        accessRole: "owner",
        isPrimary: true,
        events: (base) => [timed("studio-session", "Recording session", at(base, 6, 10), 180)],
      },
    ],
  },
];
