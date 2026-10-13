import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { env } from "@/server/env";

export type ServerEvent =
  | "signed_up"
  | "onboarding_completed"
  | "connection_created"
  | "rule_created"
  | "sync_run_completed"
  | "sync_run_failed"
  | "checkout_completed"
  | "subscription_paused"
  | "subscription_resumed";

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client === undefined) {
    client = env.POSTHOG_KEY
      ? new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
      : null;
  }
  return client;
}

/** Short-lived cache of each user's analytics consent (avoids a query per event). */
const consentCache = new Map<string, { allowed: boolean; expires: number }>();
const CONSENT_TTL_MS = 60_000;

export function forgetAnalyticsConsent(userId: string) {
  consentCache.delete(userId);
}

async function hasAnalyticsConsent(userId: string) {
  const cached = consentCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.allowed;
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { consentAnalytics: true },
  });
  const allowed = row?.consentAnalytics === true;
  consentCache.set(userId, { allowed, expires: Date.now() + CONSENT_TTL_MS });
  return allowed;
}

async function send(
  posthog: PostHog,
  distinctId: string,
  event: ServerEvent,
  properties?: Record<string, string | number | boolean | null>,
) {
  if (!(await hasAnalyticsConsent(distinctId))) return;
  posthog.capture({ distinctId, event, properties });
  await posthog.flush();
}

/**
 * Server-side product analytics. A no-op unless POSTHOG_KEY is set AND the
 * user opted into analytics in the cookie banner (stored on their account).
 * Identifies by user id only; never sends emails or event content.
 */
export const analytics = {
  capture(
    distinctId: string,
    event: ServerEvent,
    properties?: Record<string, string | number | boolean | null>,
  ) {
    const posthog = getClient();
    if (!posthog) return;
    const task = () => send(posthog, distinctId, event, properties).catch(() => {});
    try {
      after(task);
    } catch {
      // Outside a request scope (scripts): send best effort.
      void task();
    }
  },
};
