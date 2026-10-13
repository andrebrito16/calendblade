import type { MirrorInput, NormalizedEvent } from "../types";
import { type FixtureAccountSeed, fixtureAccounts } from "./scenarios";

type StoredEvent = { event: NormalizedEvent; seq: number };
type CalendarState = { events: Map<string, StoredEvent>; seq: number };

type FixtureState = {
  base: Date;
  calendars: Map<string, CalendarState>;
  revoked: Set<string>;
  /** Sync tokens older than this sequence are rejected (simulates HTTP 410). */
  minValidSeq: Map<string, number>;
  watches: Map<string, { calendarId: string; resourceId: string }>;
};

const globalStore = globalThis as unknown as { __fixtureState?: FixtureState };

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function calendarKey(accountId: string, calendarId: string) {
  return `${accountId}::${calendarId}`;
}

export function findAccount(accountId: string): FixtureAccountSeed | undefined {
  return fixtureAccounts.find((account) => account.id === accountId);
}

/** In-memory fixture state, lazily seeded relative to today (UTC). */
export function fixtureState(now = new Date()): FixtureState {
  if (!globalStore.__fixtureState) {
    globalStore.__fixtureState = createState(now);
  }
  return globalStore.__fixtureState;
}

export function resetFixtureState(now = new Date()) {
  globalStore.__fixtureState = createState(now);
  return globalStore.__fixtureState;
}

function createState(now: Date): FixtureState {
  const base = startOfUtcDay(now);
  const calendars = new Map<string, CalendarState>();
  for (const account of fixtureAccounts) {
    for (const calendar of account.calendars) {
      const state: CalendarState = { events: new Map(), seq: 0 };
      for (const event of calendar.events(base)) {
        state.seq += 1;
        state.events.set(event.id, { event, seq: state.seq });
      }
      calendars.set(calendarKey(account.id, calendar.id), state);
    }
  }
  return { base, calendars, revoked: new Set(), minValidSeq: new Map(), watches: new Map() };
}

export function calendarState(accountId: string, calendarId: string): CalendarState | undefined {
  return fixtureState().calendars.get(calendarKey(accountId, calendarId));
}

export function putEvent(accountId: string, calendarId: string, event: NormalizedEvent) {
  const state = calendarState(accountId, calendarId);
  if (!state) throw new Error(`Unknown fixture calendar ${calendarId}`);
  state.seq += 1;
  state.events.set(event.id, { event, seq: state.seq });
  return event;
}

export function mirrorToEvent(
  id: string,
  input: MirrorInput,
  extra: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  return {
    id,
    icalUid: `${id}@fixture.example.com`,
    etag: `"${Date.now()}"`,
    status: "confirmed",
    title: input.title,
    description: input.description,
    location: input.location,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    transparency: input.transparency,
    visibility: input.visibility,
    selfResponse: null,
    attendees: [],
    recurrence: input.recurrence,
    organizerIsSelf: true,
    origin: { app: "calendblade", ruleId: input.origin.ruleId, sourceEventId: input.origin.sourceEventId },
    ...extra,
  };
}

export function revokeFixtureAccount(accountId: string) {
  fixtureState().revoked.add(accountId);
}

export function restoreFixtureAccount(accountId: string) {
  fixtureState().revoked.delete(accountId);
}

/** Makes every outstanding sync token for a calendar invalid (HTTP 410). */
export function expireSyncTokens(accountId: string, calendarId: string) {
  const state = calendarState(accountId, calendarId);
  if (state) fixtureState().minValidSeq.set(calendarKey(accountId, calendarId), state.seq + 1);
}

export function isSyncTokenValid(accountId: string, calendarId: string, seq: number) {
  const min = fixtureState().minValidSeq.get(calendarKey(accountId, calendarId)) ?? 0;
  return seq >= min;
}
