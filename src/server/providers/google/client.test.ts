import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProviderError } from "../errors";
import type { ConnectionCtx } from "../types";
import { googleProvider } from "./adapter";
import { GOOGLE_CALENDAR_API, googleRequest } from "./client";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const noSleep = async () => {};
let forced = 0;
const conn: ConnectionCtx = {
  connectionId: "c1",
  providerAccountId: "sub-1",
  async getAccessToken(opts) {
    if (opts?.forceRefresh) forced += 1;
    return opts?.forceRefresh ? "fresh-token" : "token";
  },
};
const eventsUrl = `${GOOGLE_CALENDAR_API}/calendars/primary/events`;

describe("googleRequest", () => {
  it("retries 429 and 5xx with backoff, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/x", () => {
        calls += 1;
        if (calls === 1) return new HttpResponse(null, { status: 429, headers: { "retry-after": "1" } });
        if (calls === 2) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({ ok: true });
      }),
    );
    await expect(googleRequest("https://example.test/x", { sleep: noSleep })).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("treats 403 rateLimitExceeded as retryable", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/y", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { error: { message: "slow", errors: [{ reason: "rateLimitExceeded" }] } },
              { status: 403 },
            )
          : HttpResponse.json({ ok: true });
      }),
    );
    await expect(googleRequest("https://example.test/y", { sleep: noSleep })).resolves.toEqual({ ok: true });
  });

  it("gives up after the retry budget with a RATE_LIMITED error", async () => {
    server.use(http.get("https://example.test/z", () => new HttpResponse(null, { status: 429 })));
    const error = (await googleRequest("https://example.test/z", { sleep: noSleep }).catch(
      (e) => e,
    )) as ProviderError;
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("maps invalid_grant to TOKEN_REVOKED", async () => {
    server.use(
      http.post("https://example.test/token", () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    const error = (await googleRequest("https://example.test/token", {
      method: "POST",
      sleep: noSleep,
    }).catch((e) => e)) as ProviderError;
    expect(error.code).toBe("TOKEN_REVOKED");
  });
});

describe("googleProvider events", () => {
  it("follows pagination and returns the final sync token", async () => {
    server.use(
      http.get(eventsUrl, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("singleEvents")).toBe("false");
        expect(url.searchParams.get("showDeleted")).toBe("true");
        return url.searchParams.get("pageToken")
          ? HttpResponse.json({ items: [{ id: "b", status: "cancelled" }], nextSyncToken: "sync-2" })
          : HttpResponse.json({ items: [{ id: "a", summary: "A" }], nextPageToken: "p2" });
      }),
    );
    const first = await googleProvider.listEvents(conn, "primary", { syncToken: "sync-1" });
    expect(first.events.map((e) => e.id)).toEqual(["a"]);
    const second = await googleProvider.listEvents(conn, "primary", {
      syncToken: "sync-1",
      pageToken: first.nextPageToken,
    });
    expect(second).toMatchObject({ nextSyncToken: "sync-2" });
    expect(second.events[0]?.status).toBe("cancelled");
  });

  it("never sends time bounds together with a sync token", async () => {
    server.use(
      http.get(eventsUrl, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.has("timeMin")).toBe(false);
        return HttpResponse.json({ items: [] });
      }),
    );
    await googleProvider.listEvents(conn, "primary", { syncToken: "s", timeMin: new Date() });
  });

  it("reports an expired sync token (410) as invalidSyncToken", async () => {
    server.use(
      http.get(eventsUrl, () =>
        HttpResponse.json({ error: { message: "Sync token is no longer valid" } }, { status: 410 }),
      ),
    );
    await expect(googleProvider.listEvents(conn, "primary", { syncToken: "old" })).resolves.toEqual({
      events: [],
      invalidSyncToken: true,
    });
  });

  it("treats deleting an already-deleted mirror (404/410) as success", async () => {
    server.use(http.delete(`${eventsUrl}/:id`, () => new HttpResponse(null, { status: 410 })));
    await expect(googleProvider.deleteEvent(conn, "primary", "gone")).resolves.toBeUndefined();
  });

  it("surfaces a missing mirror on update as NOT_FOUND (engine recreates)", async () => {
    server.use(http.put(`${eventsUrl}/:id`, () => new HttpResponse(null, { status: 404 })));
    const error = await googleProvider
      .updateEvent(conn, "primary", "x", {
        title: "Busy",
        start: { dateTime: "2026-10-14T13:00:00Z" },
        end: { dateTime: "2026-10-14T14:00:00Z" },
        allDay: false,
        transparency: "opaque",
        visibility: "private",
        origin: { ruleId: "r", sourceEventId: "s" },
      })
      .catch((e) => e);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("writes mirrors without attendees, reminders off, and with the loop-guard properties", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(eventsUrl, async ({ request }) => {
        expect(new URL(request.url).searchParams.get("sendUpdates")).toBe("none");
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: "new", etag: "e" });
      }),
    );
    await googleProvider.createEvent(conn, "primary", {
      title: "Busy",
      start: { dateTime: "2026-10-14T13:00:00Z" },
      end: { dateTime: "2026-10-14T14:00:00Z" },
      allDay: false,
      transparency: "opaque",
      visibility: "private",
      origin: { ruleId: "rule-1", sourceEventId: "src-1" },
    });
    expect(body).not.toHaveProperty("attendees");
    expect(body.reminders).toEqual({ useDefault: false, overrides: [] });
    expect(body.extendedProperties).toEqual({
      private: { "calendblade.origin": "rule-1", "calendblade.source": "src-1" },
    });
  });

  it("forces one token refresh on HTTP 401, then retries", async () => {
    forced = 0;
    server.use(
      http.get(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, ({ request }) =>
        request.headers.get("authorization") === "Bearer fresh-token"
          ? HttpResponse.json({
              items: [{ id: "primary", summary: "Me", accessRole: "owner", primary: true }],
            })
          : new HttpResponse(null, { status: 401 }),
      ),
    );
    const calendars = await googleProvider.listCalendars(conn);
    expect(forced).toBe(1);
    expect(calendars).toEqual([
      {
        id: "primary",
        name: "Me",
        color: undefined,
        timezone: undefined,
        accessRole: "owner",
        isPrimary: true,
      },
    ]);
  });
});
