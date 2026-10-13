/**
 * Cookie consent model (GDPR / ePrivacy / LGPD). Strictly necessary storage
 * (session, security, language and UI preferences, this choice) needs no
 * consent. Optional categories stay off until the visitor opts in.
 */
export const CONSENT_COOKIE = "cb_consent";
/** Bump when categories change: everyone is asked again. */
export const CONSENT_VERSION = 1;
/** Re-ask after ~6 months (CNIL guidance; shorter than LGPD/GDPR maximums). */
export const CONSENT_MAX_AGE_DAYS = 182;

export type ConsentCategories = { errors: boolean; analytics: boolean };
export type ConsentState = ConsentCategories & { version: number; decidedAt: string };

export function parseConsent(raw: string | undefined | null): ConsentState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentState>;
    if (value.version !== CONSENT_VERSION || typeof value.decidedAt !== "string") return null;
    return {
      version: CONSENT_VERSION,
      decidedAt: value.decidedAt,
      errors: value.errors === true,
      analytics: value.analytics === true,
    };
  } catch {
    return null;
  }
}

export function serializeConsent(categories: ConsentCategories, now = new Date()): string {
  const state: ConsentState = { version: CONSENT_VERSION, decidedAt: now.toISOString(), ...categories };
  return encodeURIComponent(JSON.stringify(state));
}

/** Optional services actually configured on this instance (no banner if none). */
export function configuredOptionalServices() {
  return {
    errors: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    analytics: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  };
}
