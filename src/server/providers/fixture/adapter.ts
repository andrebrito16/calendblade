import { ProviderError } from "../errors";
import type { CalendarProvider, ConnectionCtx, EventTime, NormalizedEvent } from "../types";
import { calendarState, findAccount, fixtureState, isSyncTokenValid, mirrorToEvent, putEvent } from "./store";

const PAGE_SIZE = 50;

/**
 * Mirrors Google's behavior: every call needs a valid access token; for a
 * revoked account the API answers 401, the client forces a refresh and the
 * refresh fails with invalid_grant (TOKEN_REVOKED) via the connection context.
 */
async function authorize(conn: ConnectionCtx) {
  const revoked = fixtureState().revoked.has(conn.providerAccountId);
  await conn.getAccessToken(revoked ? { forceRefresh: true } : undefined);
  if (revoked) throw new ProviderError("TOKEN_REVOKED", "Fixture account revoked", 401);
}

async function requireCalendar(conn: ConnectionCtx, calendarId: string) {
  await authorize(conn);
  const state = calendarState(conn.providerAccountId, calendarId);
  if (!state) throw new ProviderError("NOT_FOUND", `Calendar ${calendarId} not found`, 404);
  return state;
}

function requireWritable(conn: ConnectionCtx, calendarId: string) {
  const account = findAccount(conn.providerAccountId);
  const calendar = account?.calendars.find((entry) => entry.id === calendarId);
  if (calendar && calendar.accessRole !== "owner" && calendar.accessRole !== "writer") {
    throw new ProviderError("FORBIDDEN", "Calendar is read-only", 403);
  }
}

function instant(time: EventTime) {
  return new Date(time.dateTime ?? `${time.date}T00:00:00Z`).getTime();
}

function compactStart(time: EventTime) {
  return (time.dateTime ?? time.date ?? "").replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The real recurrence expansion is not needed: overrides are explicit events. */
function overlapsWindow(event: NormalizedEvent, timeMin?: Date, timeMax?: Date) {
  const start = instant(event.start);
  const end = instant(event.end);
  if (timeMax && start >= timeMax.getTime()) return false;
  if (!event.recurrence && timeMin && end <= timeMin.getTime()) return false;
  return true;
}

let counter = 0;
const newId = () => `fx${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * In-memory provider implementing the full CalendarProvider contract.
 * Used by the seed, unit tests of the engine and local/preview E2E runs
 * (PROVIDER_FIXTURE=1). Never enabled in production.
 */
export const fixtureProvider: CalendarProvider = {
  id: "fixture",

  buildAuthUrl(state, { redirectUri, loginHint }) {
    const url = new URL(redirectUri);
    url.searchParams.set("code", loginHint ?? "fixture-work");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code) {
    const account = findAccount(code);
    if (!account) throw new ProviderError("INVALID", "Unknown fixture account", 400);
    fixtureState().revoked.delete(account.id);
    return {
      accessToken: `fixture-access:${account.id}`,
      refreshToken: `fixture-refresh:${account.id}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar"],
      account: { id: account.id, email: account.email, name: account.name },
    };
  },

  async refreshAccessToken(refreshToken) {
    const accountId = refreshToken.replace("fixture-refresh:", "");
    if (fixtureState().revoked.has(accountId)) {
      throw new ProviderError("TOKEN_REVOKED", "invalid_grant", 400);
    }
    return {
      accessToken: `fixture-access:${accountId}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: [],
    };
  },

  async revoke() {},

  async listCalendars(conn) {
    await authorize(conn);
    const account = findAccount(conn.providerAccountId);
    return (account?.calendars ?? []).map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      timezone: "UTC",
      accessRole: calendar.accessRole,
      isPrimary: calendar.isPrimary ?? false,
    }));
  },

  async listEvents(conn, calendarId, opts) {
    const state = await requireCalendar(conn, calendarId);
    let events = [...state.events.values()].sort((a, b) => a.seq - b.seq);

    if (opts.syncToken) {
      const since = Number(opts.syncToken);
      // Tokens from a previous process (state reset) are unknown, like Google's 410.
      if (
        !Number.isFinite(since) ||
        since > state.seq ||
        !isSyncTokenValid(conn.providerAccountId, calendarId, since)
      ) {
        return { events: [], invalidSyncToken: true };
      }
      events = events.filter((entry) => entry.seq > since);
    } else {
      events = events.filter((entry) => overlapsWindow(entry.event, opts.timeMin, opts.timeMax));
      if (opts.privateExtendedProperty) {
        const [, ruleId] = opts.privateExtendedProperty.split("=");
        events = events.filter((entry) => entry.event.origin?.ruleId === ruleId);
      }
    }

    const offset = opts.pageToken ? Number(opts.pageToken) : 0;
    const page = events.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < events.length;
    return {
      events: page.map((entry) => structuredClone(entry.event)),
      nextPageToken: hasMore ? String(offset + PAGE_SIZE) : undefined,
      nextSyncToken: hasMore ? undefined : String(state.seq),
    };
  },

  async getEvent(conn, calendarId, eventId) {
    const state = await requireCalendar(conn, calendarId);
    const stored = state.events.get(eventId);
    return stored ? structuredClone(stored.event) : null;
  },

  async getInstance(conn, calendarId, recurringEventId, originalStart) {
    const state = await requireCalendar(conn, calendarId);
    const master = state.events.get(recurringEventId);
    if (!master || master.event.status === "cancelled") return null;
    return { id: `${recurringEventId}_${compactStart(originalStart)}` };
  },

  async createEvent(conn, calendarId, input) {
    await requireCalendar(conn, calendarId);
    requireWritable(conn, calendarId);
    const event = putEvent(conn.providerAccountId, calendarId, mirrorToEvent(newId(), input));
    return { id: event.id, etag: event.etag };
  },

  async updateEvent(conn, calendarId, eventId, input) {
    const state = await requireCalendar(conn, calendarId);
    requireWritable(conn, calendarId);
    const existing = state.events.get(eventId);
    if (!existing) {
      // Instance ids (`<master>_<start>`) materialize an override on first write.
      const masterId = eventId.includes("_") ? eventId.slice(0, eventId.lastIndexOf("_")) : null;
      const master = masterId ? state.events.get(masterId) : undefined;
      if (!master || master.event.status === "cancelled") {
        throw new ProviderError("NOT_FOUND", "Event not found", 404);
      }
      const event = putEvent(
        conn.providerAccountId,
        calendarId,
        mirrorToEvent(
          eventId,
          { ...input, recurrence: undefined },
          {
            recurringEventId: masterId ?? undefined,
          },
        ),
      );
      return { etag: event.etag };
    }
    if (existing.event.status === "cancelled" && !existing.event.recurringEventId) {
      throw new ProviderError("GONE", "Event deleted", 410);
    }
    const event = putEvent(
      conn.providerAccountId,
      calendarId,
      mirrorToEvent(eventId, input, {
        recurringEventId: existing.event.recurringEventId,
        originalStartTime: existing.event.originalStartTime,
      }),
    );
    return { etag: event.etag };
  },

  async deleteEvent(conn, calendarId, eventId) {
    const state = await requireCalendar(conn, calendarId);
    requireWritable(conn, calendarId);
    const existing = state.events.get(eventId);
    if (existing) {
      if (existing.event.status === "cancelled") return;
      putEvent(conn.providerAccountId, calendarId, { ...existing.event, status: "cancelled" });
      return;
    }
    const masterId = eventId.includes("_") ? eventId.slice(0, eventId.lastIndexOf("_")) : null;
    const master = masterId ? state.events.get(masterId) : undefined;
    if (master) {
      putEvent(conn.providerAccountId, calendarId, {
        ...master.event,
        id: eventId,
        status: "cancelled",
        recurrence: undefined,
        recurringEventId: masterId ?? undefined,
      });
    }
  },

  async subscribe(conn, calendarId) {
    await requireCalendar(conn, calendarId);
    const channelId = crypto.randomUUID();
    const resourceId = `fixture-resource:${calendarId}`;
    fixtureState().watches.set(channelId, { calendarId, resourceId });
    return { channelId, resourceId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
  },

  async unsubscribe(_conn, watch) {
    fixtureState().watches.delete(watch.channelId);
  },
};
