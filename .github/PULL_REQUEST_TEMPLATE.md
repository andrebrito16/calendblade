## What and why

<!-- What does this change and why? Link the issue (e.g. "Closes #123"). -->

## How to test

<!-- Steps a reviewer can follow, ideally with the demo (fixture) accounts. -->

## Checklist

- [ ] New UI strings are i18n keys in `src/messages/en.json` (no hard-coded text)
- [ ] Mutations invalidate the affected cache tags (`updateTag` / `invalidateTags`)
- [ ] Anything that adds calendars or rules checks entitlements
- [ ] Tests added or updated (`bun run test`), lint and typecheck pass
- [ ] Database changes include a generated migration
- [ ] Docs updated if behavior or configuration changed
- [ ] Commits follow Conventional Commits and are signed off (`git commit -s`)
