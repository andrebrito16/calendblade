/**
 * NEXT_PUBLIC_* variables, inlined at build time. Each must be referenced
 * literally (process.env.NEXT_PUBLIC_X) for Next.js to inline it.
 */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined,
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
} as const;
