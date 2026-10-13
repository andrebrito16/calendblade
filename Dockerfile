# syntax=docker/dockerfile:1.7
# Calendblade production image (Next.js standalone output).
#   docker build -t calendblade .
#   docker run --env-file .env -p 3000:3000 calendblade

FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.4 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BRAND_NAME
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_LEGAL_ENTITY_NAME
ARG NEXT_PUBLIC_LEGAL_ADDRESS
ARG NEXT_PUBLIC_REPOSITORY_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_TELEMETRY_DISABLED=1 SKIP_ENV_VALIDATION=1
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Minimal migrator (drizzle-orm + postgres) for `docker/entrypoint.sh`.
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=deps --chown=app:app /app/node_modules/drizzle-orm ./migrator/node_modules/drizzle-orm
COPY --from=deps --chown=app:app /app/node_modules/postgres ./migrator/node_modules/postgres
COPY --chown=app:app docker/migrate.mjs ./migrator/migrate.mjs
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["sh", "./entrypoint.sh"]
