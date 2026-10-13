import "server-only";
import { env } from "@/server/env";
import { normalizeGoogleEvent } from "../../sync/normalize";
import { isProviderError, ProviderError } from "../errors";
import {
  type CalendarProvider,
  type ConnectionCtx,
  type MirrorInput,
  ORIGIN_KEY,
  type ProviderCalendar,
  SOURCE_KEY,
} from "../types";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_CALENDAR_API,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  googleRequest,
} from "./client";
import type {
  GoogleCalendarList,
  GoogleChannel,
  GoogleEvent,
  GoogleEventList,
  GoogleTokenResponse,
  GoogleUserInfo,
} from "./types";

export const GOOGLE_CONNECTION_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
];

/** Requested lifetime for push channels; Google caps event channels at ~7 days. */
const WATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const calendarPath = (calendarId: string) =>
  `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}`;
const eventPath = (calendarId: string, eventId: string) =>
  `${calendarPath(calendarId)}/events/${encodeURIComponent(eventId)}`;

function credentials() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ProviderError("INVALID", "Google OAuth is not configured");
  }
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

/** Runs an API call, forcing one token refresh on HTTP 401. */
async function authed<T>(conn: ConnectionCtx, call: (token: string) => Promise<T>): Promise<T> {
  try {
    return await call(await conn.getAccessToken());
  } catch (error) {
    if (!isProviderError(error) || error.status !== 401) throw error;
    try {
      return await call(await conn.getAccessToken({ forceRefresh: true }));
    } catch (retryError) {
      if (isProviderError(retryError) && retryError.status === 401) {
        throw new ProviderError("TOKEN_REVOKED", retryError.message, 401);
      }
      throw retryError;
    }
  }
}

/** Mirror payload: no attendees, reminders off, origin in private props. */
function toGoogleBody(input: MirrorInput) {
  return {
    summary: input.title,
    description: input.description ?? "",
    location: input.location ?? "",
    start: input.start,
    end: input.end,
    transparency: input.transparency,
    visibility: input.visibility,
    ...(input.colorId ? { colorId: input.colorId } : {}),
    ...(input.recurrence ? { recurrence: input.recurrence } : {}),
    reminders: { useDefault: false, overrides: [] },
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    extendedProperties: {
      private: {
        [ORIGIN_KEY]: input.origin.ruleId,
        [SOURCE_KEY]: input.origin.sourceEventId,
      },
    },
  };
}

export const googleProvider: CalendarProvider = {
  id: "google",

  buildAuthUrl(state, { redirectUri, loginHint }) {
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: credentials().clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_CONNECTION_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      ...(loginHint ? { login_hint: loginHint } : {}),
    }).toString();
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const { clientId, clientSecret } = credentials();
    const tokens = await googleRequest<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
      method: "POST",
      form: {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      },
    });
    const info = await googleRequest<GoogleUserInfo>(GOOGLE_USERINFO_URL, {
      accessToken: tokens.access_token,
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope?.split(" ") ?? [],
      account: { id: info.sub, email: info.email, name: info.name, avatarUrl: info.picture },
    };
  },

  async refreshAccessToken(refreshToken) {
    const { clientId, clientSecret } = credentials();
    const tokens = await googleRequest<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
      method: "POST",
      form: {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      },
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      scopes: tokens.scope?.split(" ") ?? [],
    };
  },

  async revoke(token) {
    try {
      await googleRequest(GOOGLE_REVOKE_URL, { method: "POST", form: { token } });
    } catch (error) {
      // Already revoked or expired tokens are fine.
      if (!isProviderError(error, "INVALID") && !isProviderError(error, "TOKEN_REVOKED")) {
        throw error;
      }
    }
  },

  async listCalendars(conn) {
    const calendars: ProviderCalendar[] = [];
    let pageToken: string | undefined;
    do {
      const page = await authed(conn, (accessToken) =>
        googleRequest<GoogleCalendarList>(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
          accessToken,
          query: { maxResults: 250, pageToken, showDeleted: false },
        }),
      );
      for (const entry of page.items ?? []) {
        if (entry.deleted) continue;
        calendars.push({
          id: entry.id,
          name: entry.summaryOverride ?? entry.summary ?? entry.id,
          color: entry.backgroundColor,
          timezone: entry.timeZone,
          accessRole: entry.accessRole,
          isPrimary: entry.primary ?? false,
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return calendars;
  },

  async listEvents(conn, calendarId, opts) {
    try {
      const page = await authed(conn, (accessToken) =>
        googleRequest<GoogleEventList>(`${calendarPath(calendarId)}/events`, {
          accessToken,
          query: {
            maxResults: 250,
            singleEvents: false,
            showDeleted: true,
            pageToken: opts.pageToken,
            syncToken: opts.syncToken,
            // Google rejects these together with a sync token.
            ...(opts.syncToken
              ? {}
              : {
                  timeMin: opts.timeMin?.toISOString(),
                  timeMax: opts.timeMax?.toISOString(),
                  privateExtendedProperty: opts.privateExtendedProperty,
                }),
          },
        }),
      );
      return {
        events: (page.items ?? []).map(normalizeGoogleEvent),
        nextPageToken: page.nextPageToken,
        nextSyncToken: page.nextSyncToken,
      };
    } catch (error) {
      if (opts.syncToken && isProviderError(error, "GONE")) {
        return { events: [], invalidSyncToken: true };
      }
      throw error;
    }
  },

  async getEvent(conn, calendarId, eventId) {
    try {
      const event = await authed(conn, (accessToken) =>
        googleRequest<GoogleEvent>(eventPath(calendarId, eventId), { accessToken }),
      );
      return normalizeGoogleEvent(event);
    } catch (error) {
      if (isProviderError(error, "NOT_FOUND") || isProviderError(error, "GONE")) return null;
      throw error;
    }
  },

  async getInstance(conn, calendarId, recurringEventId, originalStart) {
    const original = originalStart.dateTime ?? originalStart.date;
    if (!original) return null;
    try {
      const page = await authed(conn, (accessToken) =>
        googleRequest<GoogleEventList>(`${eventPath(calendarId, recurringEventId)}/instances`, {
          accessToken,
          query: { originalStart: original, showDeleted: true, maxResults: 1 },
        }),
      );
      const instance = page.items?.[0];
      return instance ? { id: instance.id } : null;
    } catch (error) {
      if (isProviderError(error, "NOT_FOUND") || isProviderError(error, "GONE")) return null;
      throw error;
    }
  },

  async createEvent(conn, calendarId, input) {
    const event = await authed(conn, (accessToken) =>
      googleRequest<GoogleEvent>(`${calendarPath(calendarId)}/events`, {
        method: "POST",
        accessToken,
        query: { sendUpdates: "none" },
        json: toGoogleBody(input),
      }),
    );
    return { id: event.id, etag: event.etag };
  },

  async updateEvent(conn, calendarId, eventId, input) {
    const event = await authed(conn, (accessToken) =>
      googleRequest<GoogleEvent>(eventPath(calendarId, eventId), {
        method: "PUT",
        accessToken,
        query: { sendUpdates: "none" },
        json: { ...toGoogleBody(input), status: "confirmed" },
      }),
    );
    return { etag: event.etag };
  },

  async deleteEvent(conn, calendarId, eventId) {
    try {
      await authed(conn, (accessToken) =>
        googleRequest(eventPath(calendarId, eventId), {
          method: "DELETE",
          accessToken,
          query: { sendUpdates: "none" },
        }),
      );
    } catch (error) {
      if (isProviderError(error, "NOT_FOUND") || isProviderError(error, "GONE")) return;
      throw error;
    }
  },

  async subscribe(conn, calendarId, webhookUrl, token) {
    const channel = await authed(conn, (accessToken) =>
      googleRequest<GoogleChannel>(`${calendarPath(calendarId)}/events/watch`, {
        method: "POST",
        accessToken,
        json: {
          id: crypto.randomUUID(),
          type: "web_hook",
          address: webhookUrl,
          token,
          expiration: Date.now() + WATCH_TTL_MS,
        },
      }),
    );
    return {
      channelId: channel.id,
      resourceId: channel.resourceId,
      expiresAt: new Date(Number(channel.expiration ?? Date.now() + WATCH_TTL_MS)),
    };
  },

  async unsubscribe(conn, watch) {
    try {
      await authed(conn, (accessToken) =>
        googleRequest(`${GOOGLE_CALENDAR_API}/channels/stop`, {
          method: "POST",
          accessToken,
          json: { id: watch.channelId, resourceId: watch.resourceId },
        }),
      );
    } catch (error) {
      if (isProviderError(error, "NOT_FOUND") || isProviderError(error, "GONE")) return;
      throw error;
    }
  },
};
