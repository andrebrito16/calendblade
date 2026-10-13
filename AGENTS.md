<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Calendblade conventions

- Read `docs/architecture.md` first. Server-only code lives in `src/server/**` and starts with `import "server-only"`.
- Cache Components: never read the session at the top of a layout; `getCurrentUser()` (`'use cache: private'`) is the only session read for rendering. Per-user data uses inner `'use cache'` functions keyed by user id with tags from `src/server/cache.ts`. Server Actions call `updateTag`; route handlers/background code call `invalidateTags` (`revalidateTag` with `expire: 0`).
- Request-time values (`new Date()`, uncached DB reads) must come after a dynamic access: use `requestNow()` from `src/server/time.ts`. `params`/`searchParams` of dynamic routes are awaited inside a `<Suspense>` child, not at the page top.
- i18n: no hard-coded UI strings. Inside cached scopes pass `locale` to `getTranslations({ locale })`. Outside requests (cron, emails, sync engine) use `getServerTranslator(locale)`. Run `bun run i18n:check` after editing messages.
- Server Actions return `ActionResult` via `runAction()`; validate with zod schemas from `src/lib/schemas`, call `requireUser()` and `limitAction()`, and scope every query by user id.
- Correlated SQL subqueries: write them with explicit table aliases (Drizzle renders column refs unqualified inside them).
- The sync engine's decisions live in the pure `src/server/sync/plan.ts`; cover changes with `plan.test.ts` and the fixture-backed integration tests in `tests/integration`.
- Do not hand-edit `src/components/ui` (shadcn output).
