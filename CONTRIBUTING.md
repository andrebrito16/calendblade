# Contributing to Calendblade

Thanks for helping! This guide gets you from clone to pull request.

## Development setup

Requirements: [Bun](https://bun.sh) 1.4, Docker (for Postgres and a local mail inbox).

```bash
bun install
docker compose up -d          # Postgres on :5433, Mailpit on :1025 (SMTP) / :8025 (web inbox)
bun run setup:env             # creates .env.local with generated secrets
bun run db:migrate
bun run db:seed               # optional: demo user, demo connections and rules
bun dev                       # http://localhost:3100
```

You don't need Google, Stripe or Resend credentials to work on the app:

- `PROVIDER_FIXTURE=1` enables **demo accounts**: in-memory Google-like calendars with realistic events (recurring series, declined, tentative, private, all-day…). Use "Connect demo account" on the Connections page.
- `DEV_MAGIC_LINK_ENDPOINT=1` shows a "Development: open the sign-in link" button after requesting a magic link. Emails also land in Mailpit at http://localhost:8025.
- `BILLING_ENABLED=false` gives every account unlimited calendars and rules.
- `POST /api/dev/fixture` mutates demo calendars (create/move/rename/cancel events, revoke an account, expire sync tokens) to exercise sync paths.

## Workflow

1. Open or pick an issue; for larger changes, describe the approach first.
2. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
3. Keep pull requests focused; fill in the PR template checklist.
4. CI must pass: lint, typecheck, unit/integration tests, build, secret scan, commit lint.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org) (enforced by commitlint), e.g. `feat(rules): add color picker` or `fix(sync): handle 410 on first page`.

### Developer Certificate of Origin

Every commit must be signed off, certifying you have the right to submit it under the project license ([DCO](https://developercertificate.org)):

```bash
git commit -s -m "fix(sync): …"
```

## Scripts

| Command | What it does |
| --- | --- |
| `bun dev` | Dev server on port 3100 |
| `bun run lint` / `bun run format` | Biome lint / format |
| `bun run typecheck` | Route type generation + `tsc --noEmit` |
| `bun run test` | Vitest unit and integration tests (needs the Docker Postgres) |
| `bun run test:e2e` | Playwright end-to-end tests |
| `bun run i18n:check` | Verifies every locale has every key in `en.json` |
| `bun run db:generate` | Generate a SQL migration from schema changes |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Seed demo data |

## Code conventions

- **Server-only code** lives in `src/server/**` and starts with `import "server-only"`. Isomorphic helpers go in `src/lib/**`.
- **Data access**: pages read data through `src/server/queries/*`, which resolve the current user themselves; cached inner functions take the user id and are never exported.
- **Mutations** are Server Actions in `src/server/actions/*`: validate with zod, call `requireUser()`, check ownership in SQL, mutate, call `updateTag()` for every affected cache tag, and return an `ActionResult` (`{ ok: true, data } | { ok: false, error: { code } }`). Don't throw user-facing errors across the boundary.
- **Cache tags** follow `src/server/cache.ts` (`rules:<userId>`, `rule:<id>`, …). Background code uses `invalidateTags()` (revalidateTag) instead of `updateTag()`.
- **No hard-coded UI strings**: everything goes through next-intl messages in `src/messages/en.json`.
- **Entitlements**: anything that adds a calendar or rule must go through `assertCanAddCalendar` / `assertCanAddRule`.
- Add tests next to the code (`*.test.ts`) or in `tests/integration` for database-backed behavior.

## Adding a locale

1. Add the locale to `routing.locales` in `src/i18n/routing.ts`.
2. Add `src/messages/<locale>.json` with every key from `en.json` (`bun run i18n:check` and CI verify this).
3. Translate the busy-block title (`sync.busyTitle`) and email copy (`emails.*`).
4. Add the locale to `PUBLIC_LOCALES` once the translation is complete; until then it's routable for testing but hidden.

## Adding a calendar provider

1. Implement the `CalendarProvider` interface (`src/server/providers/types.ts`) in `src/server/providers/<id>/`: OAuth, calendar discovery, event listing with incremental sync, create/update/delete, push subscriptions.
2. Normalize events to `NormalizedEvent` and store the loop-guard metadata (`calendblade.origin` = rule id, `calendblade.source` = source event id) in the provider's equivalent of private extended properties, reading it back into `origin`.
3. Register it in `src/server/providers/registry.ts` and add the value to the `connection_provider` enum (schema + `bun run db:generate`).
4. Add the connect button and translations.
5. Add contract tests with `msw` (pagination, expired sync token, rate limits, missing events) like `src/server/providers/google/client.test.ts`.

## Reporting security issues

See [SECURITY.md](./SECURITY.md). Please don't open public issues for vulnerabilities.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).
