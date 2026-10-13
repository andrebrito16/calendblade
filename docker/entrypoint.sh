#!/bin/sh
# Apply database migrations, then start the Next.js server.
# Set SKIP_MIGRATIONS=1 when migrations run elsewhere (e.g. CI before deploy).
set -e
if [ "${SKIP_MIGRATIONS}" != "1" ]; then
  node ./migrator/migrate.mjs
fi
exec node server.js
