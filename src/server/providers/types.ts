import "server-only";

export type ProviderId = "google" | "fixture";

export type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
};

export type ProviderAccount = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
};

export type AccessRole = "owner" | "writer" | "reader" | "freeBusyReader";

export type ProviderCalendar = {
  id: string;
  name: string;
  color?: string;
  timezone?: string;
  accessRole: AccessRole;
  isPrimary: boolean;
};

export type EventTime = { dateTime?: string; date?: string; timeZone?: string };

export type ResponseStatus = "accepted" | "tentative" | "declined" | "needsAction";

export type EventOrigin = { app: "calendblade"; ruleId: string; sourceEventId?: string };

/** Provider-agnostic event shape consumed by the sync engine. */
export type NormalizedEvent = {
  id: string;
  icalUid?: string;
  etag?: string;
  status: "confirmed" | "tentative" | "cancelled";
  title: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  allDay: boolean;
  transparency: "opaque" | "transparent";
  visibility: "default" | "public" | "private" | "confidential";
  selfResponse: ResponseStatus | null;
  attendees: { email: string; name?: string; response: ResponseStatus }[];
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: EventTime;
  organizerIsSelf: boolean;
  /** Read from extended properties: set on every mirror (loop guard). */
  origin: EventOrigin | null;
};

/** What the engine writes into a target calendar. */
export type MirrorInput = {
  title: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  allDay: boolean;
  transparency: "opaque" | "transparent";
  visibility: "default" | "public" | "private" | "confidential";
  colorId?: string;
  recurrence?: string[];
  origin: { ruleId: string; sourceEventId: string };
};

export type ListEventsOpts = {
  syncToken?: string;
  timeMin?: Date;
  timeMax?: Date;
  pageToken?: string;
  /** `key=value` filter on private extended properties (no sync token). */
  privateExtendedProperty?: string;
};

export type EventPage = {
  events: NormalizedEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  /** The sync token expired (HTTP 410): run a full resync. */
  invalidSyncToken?: boolean;
};

export type WatchInfo = { channelId: string; resourceId: string; expiresAt: Date };

export type ConnectionCtx = {
  connectionId: string;
  providerAccountId: string;
  /** Returns a valid access token, refreshing when expiring or forced. */
  getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>;
};

export interface CalendarProvider {
  id: ProviderId;
  // OAuth
  buildAuthUrl(state: string, opts: { redirectUri: string; loginHint?: string }): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet & { account: ProviderAccount }>;
  refreshAccessToken(refreshToken: string): Promise<TokenSet>;
  revoke(token: string): Promise<void>;
  // Discovery
  listCalendars(conn: ConnectionCtx): Promise<ProviderCalendar[]>;
  // Events
  listEvents(conn: ConnectionCtx, calendarId: string, opts: ListEventsOpts): Promise<EventPage>;
  getEvent(conn: ConnectionCtx, calendarId: string, eventId: string): Promise<NormalizedEvent | null>;
  /** Finds one occurrence of a recurring event by its original start. */
  getInstance(
    conn: ConnectionCtx,
    calendarId: string,
    recurringEventId: string,
    originalStart: EventTime,
  ): Promise<{ id: string } | null>;
  createEvent(
    conn: ConnectionCtx,
    calendarId: string,
    input: MirrorInput,
  ): Promise<{ id: string; etag?: string }>;
  updateEvent(
    conn: ConnectionCtx,
    calendarId: string,
    eventId: string,
    input: MirrorInput,
  ): Promise<{ etag?: string }>;
  deleteEvent(conn: ConnectionCtx, calendarId: string, eventId: string): Promise<void>;
  // Push
  subscribe(conn: ConnectionCtx, calendarId: string, webhookUrl: string, token: string): Promise<WatchInfo>;
  unsubscribe(conn: ConnectionCtx, watch: WatchInfo): Promise<void>;
}

export const ORIGIN_KEY = "calendblade.origin";
export const SOURCE_KEY = "calendblade.source";
