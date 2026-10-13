# Architecture

Calendblade is a single Next.js 16 application (App Router, Cache Components, React Compiler) backed by PostgreSQL. Background work runs in the same app, triggered by HTTP cron calls, push notifications and `after()`.

## Layout

```
src/
  app/[locale]/(marketing)   landing, pricing, legal (fully cached)
  app/[locale]/(auth)        sign-in, magic-link sent
  app/[locale]/(app)         authenticated app shell and screens
  app/api/                   auth, connection OAuth, webhooks, cron, health
  components/                ui (shadcn), app shell, feature components
  server/                    server-only code ("server-only" import)
    auth/                    Better Auth instance and session DAL
    db/                      Drizzle client, schema, migrations
    providers/               CalendarProvider interface, Google, fixture
    sync/                    sync engine (plan, run, watches, teardown)
    jobs/                    Postgres job queue and worker
    billing/                 entitlements, Stripe hooks, lifecycle
    email/                   transports and React Email templates
    queries/ actions/        cached reads and Server Actions
  i18n/ messages/            next-intl routing and message catalogs
  lib/                       isomorphic helpers and zod schemas
drizzle/                     generated SQL migrations
tests/                       integration tests, Playwright E2E
```

## Rendering and caching (Cache Components)

- Every route renders a **static shell**; anything that needs the session streams in behind `<Suspense>`.
- The session is read only in `src/server/auth/session.ts`. `getCurrentUser()` uses `"use cache: private"` (cached per browser session, never on the server) and loads the profile through a `"use cache"` function tagged `user:<id>`.
- User data is cached on the server **keyed by user id** with tags such as `connections:<userId>`, `rules:<userId>`, `rule:<id>`, `runs:<userId>`, `billing:<userId>`. The cached inner functions are not exported: the exported query resolves the current user itself, so a caller can't request another user's data.
- Server Actions invalidate with `updateTag()` (read-your-own-writes). Background code (cron, webhooks, the sync engine) uses `revalidateTag(tag, { expire: 0 })` via `invalidateTags()`.
- Values that depend on the current time (relative times, trial countdowns) are read after `connection()`, so they never end up in a prerendered shell.
- The activity log is always request-time.

## Data access and mutations

- Reads: `src/server/queries/*` (one file per aggregate).
- Writes: Server Actions in `src/server/actions/*`. Each one parses its input with zod, calls `requireUser()`, scopes every query to the user, applies a per-user rate limit, mutates, invalidates cache tags and returns
  `{ ok: true, data } | { ok: false, error: { code, fieldErrors? } }`. User-facing errors never cross the boundary as exceptions; validation messages are i18n keys.

## Authentication

Better Auth with Google sign-in (identity scopes only) and magic links (hashed, 10-minute, single-use tokens, rate limited). **Calendar access is a separate OAuth flow**: one user may connect several Google accounts, magic-link users can connect calendars too, and tokens live in our own `calendar_connection` table, encrypted.

## Calendar providers

`CalendarProvider` (`src/server/providers/types.ts`) covers OAuth, calendar discovery, event listing with incremental sync tokens, create/update/delete, occurrence lookup for recurring series, and push subscriptions. Events are normalized to a provider-agnostic `NormalizedEvent`.

- **Google** uses plain `fetch` against the REST API with retries/backoff on 429/5xx (honoring `Retry-After`), and a forced token refresh on HTTP 401.
- **Fixture** is an in-memory implementation of the same contract with scripted scenarios, used by tests, seeds and local development (`PROVIDER_FIXTURE=1`).

Mirrors are written **without attendees** (guests become text in the description in full mode), with **reminders off**, and with two private extended properties: `calendblade.origin` (rule id) and `calendblade.source` (source event id).

## Sync engine

`src/server/sync/`

- **`plan()`** is a pure function deciding `create | update | delete | skip` for one event and one rule. It applies the filters (cancelled, free/transparent, declined, tentative, all-day, private), the sync window (`past_days` / `future_days`), the **loop guard** (events carrying `calendblade.origin` are never mirrored, so two opposite rules form a safe two-way sync) and a **content hash** of what would be written (unchanged events cost no API call).
- **One sync per source calendar.** Incremental sync tokens belong to the source calendar, so a run fans one change feed out to every active rule reading from it. A short **lease** on the calendar row guarantees one run per source at a time.
- **Masters first.** Recurring masters are applied before their occurrences; occurrences patch the matching instance of the mirrored series (or cancel it).
- **Full resync** lists the whole window, **adopts** mirrors found in the target by extended property (so a crash between write and bookkeeping never duplicates), applies `plan()` and deletes orphans. It runs on rule creation, rule edits, the daily window advance, and whenever the provider reports an expired sync token (HTTP 410).
- **User-deleted mirrors** are recreated once; if the user deletes the same mirror again within a day, it stays deleted until the source event changes.
- Every run is logged per rule (`sync_run`) with counters and error codes. Revoked tokens mark the connection `needs_reauth`, pause its rules and email the owner once.

## Job queue

A Postgres table (`job`) processed by `processJobs({ budgetMs })`:

- Dedupe keys are unique among **pending** jobs (partial unique index), so bursts coalesce while a change arriving during a run still queues a follow-up.
- Claims use `FOR UPDATE SKIP LOCKED`, so overlapping cron calls and `after()` callbacks are safe. Push-channel jobs (`renew_watch`) are claimed and run before syncs, so a long first sync can't leave a new rule without real-time updates.
- Retries back off 30 s → 2 m → 10 m → 30 m → 2 h; after `max_attempts` a job is dead and its rules are marked as errored. Stale claims are released after 10 minutes.
- Kinds: `sync_rule`, `full_resync_rule`, `renew_watch`, `teardown_rule`, `teardown_connection`. Teardowns respect the time budget and resume where they stopped.

## Push channels and scheduled work

- A Google push channel exists for every source calendar used by an active rule. Webhooks verify an HMAC channel token, mark the calendar dirty, enqueue a debounced sync and process it right after responding.
- `/api/cron/sync` (every 5 min) processes due jobs and enqueues a safety-net sync for sources idle for 30+ minutes.
- `/api/cron/renew-watches` (every 6 h) renews channels expiring within 24 h.
- `/api/cron/housekeeping` (daily) advances the window, prunes logs and tombstones, releases stale claims and cleans up paused accounts.

All three require `Authorization: Bearer <CRON_SECRET>`.

## Entitlements

`src/server/billing/` resolves a single `Entitlements` object (plan, limits, `canSync`) from the subscription rows through a pure, unit-tested function. With `BILLING_ENABLED=false` everyone is unlimited. Server Actions and the connection start route enforce limits with fresh counts; the UI uses cached ones.

## Internationalization

next-intl with a `[locale]` root segment (`as-needed` prefix). Server Components read the locale from `next/root-params`. Outside a request (cron, webhooks, the sync engine, emails) the locale is passed explicitly and messages are loaded with `createTranslator`. The app formats dates in each user's stored time zone.

## Security

- Provider tokens: AES-256-GCM, versioned (`v1:`), never sent to the browser.
- Calendar OAuth: signed short-lived `state` (HS256 JWT) bound to an httpOnly nonce cookie; post-connect redirects accept relative paths only.
- Webhooks: HMAC channel tokens with constant-time comparison. Cron: bearer secret.
- Content Security Policy is sent as a response header. It doesn't use nonces, because nonces require per-request rendering and would defeat Cache Components' static shells; all other sources are pinned. Standard hardening headers (HSTS, frame denial, nosniff, referrer and permissions policies) are set too.
- Rate limits: Better Auth's built-in limits on auth routes plus a per-user fixed-window limiter on Server Actions.

## Observability, consent and privacy

- **Consent first.** Browser telemetry is opt-in through a cookie banner (`src/components/consent`). Before a choice, and after a rejection, Sentry and PostHog are not loaded at all; accepting initializes them, withdrawing removes PostHog storage and reloads the page. "Reject all" and "Accept all" have equal prominence. The choice lives in the `cb_consent` cookie (6 months, versioned so new categories re-ask) and, for signed-in users, on the account (`user.consent_*`) as proof of consent.
- **Server side.** PostHog server events are sent only when the account opted into analytics. Server-side Sentry (when `SENTRY_DSN` is set) reports server errors without cookies, headers, bodies, query strings, user info or local variables; it is disclosed as a legitimate-interest processing in the privacy policy.
- **No banner when nothing optional is configured** (typical self-host): the instance then uses strictly necessary storage only.
- **Data subject rights in product:** profile editing, cookie settings, JSON data export (`/api/account/export`, never includes tokens) and self-service account deletion.
- **Legal pages** (`/legal/privacy`, `/legal/terms`, `/legal/cookies`) are rendered from messages; operator details come from `NEXT_PUBLIC_*` env and paragraphs whose optional details are unset are omitted.
- Logs are structured JSON (`src/server/log.ts`) and never include tokens or event content.

## Testing

- **Unit** (Vitest): `plan()`, normalization, hashing, window math, entitlements, encryption, schemas.
- **Contract** (Vitest + msw): Google client pagination, 410, rate limits, 401 refresh.
- **Integration** (Vitest + Postgres + fixture provider): the sync engine matrix, the job queue and teardown.
- **E2E** (Playwright): sign-in through a magic link, onboarding with demo accounts, rule creation, editing, deletion with mirror cleanup, disconnecting, account deletion, cookie consent (no telemetry before opt-in, withdrawal) and axe accessibility scans on desktop and mobile.
