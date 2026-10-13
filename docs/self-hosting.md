# Self-hosting Calendblade

Calendblade is a standard Next.js app with a PostgreSQL database. Billing and telemetry are optional; a self-hosted instance needs only Postgres, an SMTP server and a Google OAuth app.

> The code is AGPL-3.0. The Calendblade name and logo are not licensed: set `NEXT_PUBLIC_BRAND_NAME` and the other brand variables to your own identity.

## Requirements

- Docker, **or** Node.js 22+ / Bun 1.4
- PostgreSQL 15+
- An SMTP server (for magic-link sign-in and notifications)
- A Google Cloud project with an OAuth client
- A public HTTPS URL if you want near-real-time push updates (optional; see [Webhooks](#webhooks))

## 1. Google Cloud setup

1. Create a project in the [Google Cloud console](https://console.cloud.google.com/).
2. **APIs & Services → Library**: enable the **Google Calendar API**.
3. **OAuth consent screen**: user type *External*, add your app name, support email, homepage, privacy policy (`/legal/privacy`) and terms (`/legal/terms`) URLs.
4. Scopes: `openid`, `email`, `profile` and `https://www.googleapis.com/auth/calendar`.
5. **Credentials → Create OAuth client ID** (type *Web application*) with these authorized redirect URIs:
   - `https://<your-domain>/api/auth/callback/google` (sign in with Google)
   - `https://<your-domain>/api/connections/google/callback` (connecting calendars)
6. Put the client id and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

The calendar scope is *sensitive*. While your app is unverified (or in "Testing" mode) Google limits it to 100 users and shows a warning screen; add yourself as a test user. To open it to the public, submit the app for Google's OAuth verification (it requires the privacy policy, a scope justification and a demo video, and can take several weeks).

## 2. Configuration

Copy [`.env.example`](../.env.example) and fill it in. Required in production:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres URL (`DATABASE_URL_UNPOOLED` for migrations if you use a pooler) |
| `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL` | Your public origin, e.g. `https://cal.example.com` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (exactly 32 bytes) |
| `CONNECTION_STATE_SECRET`, `WEBHOOK_SECRET` | `openssl rand -base64 48` each |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 1 |
| `EMAIL_TRANSPORT=smtp`, `SMTP_URL`, `EMAIL_FROM` | e.g. `smtp://user:pass@smtp.example.com:587` |
| `BILLING_ENABLED=false` | Every account gets unlimited calendars and rules; billing UI is hidden |
| `NEXT_PUBLIC_PRIVACY_EMAIL`, `NEXT_PUBLIC_DPO_NAME`, `NEXT_PUBLIC_EU_REPRESENTATIVE`, `NEXT_PUBLIC_LEGAL_JURISDICTION` | Privacy contact, Data Protection Officer (Encarregado under the LGPD), EU representative and governing law used by the legal pages; empty optional fields are omitted. Have the texts reviewed for your jurisdiction |
| `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_LEGAL_ENTITY_NAME`, `NEXT_PUBLIC_LEGAL_ADDRESS` | Your identity, shown in the UI, emails and legal pages |

Never enable `PROVIDER_FIXTURE` or `DEV_MAGIC_LINK_ENDPOINT` in production (the app refuses to start if you do). Sentry and PostHog stay off unless their keys are set; when they are, a cookie banner asks visitors for consent before the browser SDKs load.

## 3. Run with Docker

The repository ships a `Dockerfile` (Next.js `standalone` output) and a `docker-compose.yml`:

- `docker compose up -d` starts only the development services (Postgres on port 5433 and Mailpit).
- `docker compose --profile app up -d --build` also builds and starts the **app** on port 3000 and a **cron** sidecar that calls the scheduled endpoints (sync every 5 minutes, renew-watches every 6 hours, housekeeping daily around 03:00 UTC) with your `CRON_SECRET`. Both read configuration from `.env`.

The container entrypoint applies database migrations and then runs `node server.js`. Set `SKIP_MIGRATIONS=1` to skip the migration step (for example when you run migrations from CI).

```bash
cp .env.example .env      # fill in production values
docker compose --profile app up -d --build
```

`NEXT_PUBLIC_*` values are inlined at build time; rebuild the image after changing them.

Without Docker:

```bash
bun install --frozen-lockfile
bun run db:migrate
bun run build
bun run start
```

Put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front.

## 4. Scheduled jobs

Calendblade does its background work in three HTTP endpoints. Any scheduler can call them; each request must send `Authorization: Bearer $CRON_SECRET` (otherwise `401`). Responses are JSON summaries.

| Endpoint | Schedule | Purpose |
| --- | --- | --- |
| `GET /api/cron/sync` | every 5 minutes | process queued syncs; safety-net sync for rules idle 30+ minutes |
| `GET /api/cron/renew-watches` | every 6 hours | renew Google push channels expiring within 24 hours |
| `GET /api/cron/housekeeping` | daily, 03:30 UTC | sync-window advance, log retention, stale-job recovery, paused-account cleanup |

Overlapping invocations are safe. If you use the compose `cron` sidecar you don't need anything else; otherwise use one of the options below.

### crontab

```cron
# m   h  dom mon dow  command
*/5   *  *   *   *    curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://cal.example.com/api/cron/sync >/dev/null
0     */6 *  *   *    curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://cal.example.com/api/cron/renew-watches >/dev/null
30    3  *   *   *    curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://cal.example.com/api/cron/housekeeping >/dev/null
```

(Define `CRON_SECRET` at the top of the crontab or in a wrapper script.)

### GitHub Actions

```yaml
name: calendblade-cron
on:
  schedule:
    - cron: "*/5 * * * *"    # sync
    - cron: "0 */6 * * *"    # renew-watches
    - cron: "30 3 * * *"     # housekeeping
  workflow_dispatch:
jobs:
  call:
    runs-on: ubuntu-latest
    steps:
      - name: Call endpoint
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          BASE_URL: ${{ vars.CALENDBLADE_URL }}
        run: |
          case "${{ github.event.schedule }}" in
            "0 */6 * * *") path=renew-watches ;;
            "30 3 * * *")  path=housekeeping ;;
            *)             path=sync ;;
          esac
          curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$BASE_URL/api/cron/$path"
```

GitHub may delay scheduled workflows by several minutes; a crontab or a dedicated cron service is more punctual.

## Webhooks

Google push notifications are delivered to `https://<your-domain>/api/webhooks/google` and require a **public HTTPS** URL. Without one, Calendblade skips creating push channels and relies on the 5-minute sync cron, so changes still sync, just with a few minutes of delay.

## Email

Set `EMAIL_TRANSPORT=smtp` with `SMTP_URL` (or `resend` with `RESEND_API_KEY`). Magic-link sign-in depends on email delivery, so configure SPF/DKIM for your sending domain.

## Backups

All state lives in PostgreSQL. Back it up regularly (`pg_dump`, or your provider's point-in-time recovery). Also keep `TOKEN_ENCRYPTION_KEY` safe: without it, stored Google tokens can't be decrypted and users must reconnect their accounts.

## Upgrading

```bash
git pull
docker compose --profile app up -d --build   # migrations run on container start
# or without Docker: bun install && bun run db:migrate && bun run build
```

Read the release notes for breaking changes to environment variables.

## Rotating the token encryption key

Encrypted tokens are stored with a version prefix (`v1:<iv>:<ciphertext>:<tag>`). To rotate, a new key version must be introduced and existing tokens re-encrypted with a migration script; until such a script exists, changing `TOKEN_ENCRYPTION_KEY` invalidates every stored token and users will need to reconnect their Google accounts.
