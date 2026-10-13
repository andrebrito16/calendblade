import * as Sentry from "@sentry/nextjs";

/**
 * Browser telemetry is consent-gated: Sentry and PostHog are initialized by
 * ConsentProvider (src/components/consent) only after the visitor opts in.
 * Without an initialized client this hook is a no-op.
 */
export const onRouterTransitionStart = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? Sentry.captureRouterTransitionStart
  : undefined;
