"use client";

import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_DAYS,
  type ConsentCategories,
  type ConsentState,
  configuredOptionalServices,
  parseConsent,
  serializeConsent,
} from "@/lib/consent";
import { sentryDataCollection } from "@/lib/sentry-options";
import { saveConsent } from "@/server/actions/consent";
import { ConsentBanner } from "./consent-banner";
import { ConsentDialog } from "./consent-dialog";

type ConsentContextValue = {
  /** null until the visitor decides (or before hydration). */
  consent: ConsentState | null;
  services: ConsentCategories;
  decide: (categories: ConsentCategories) => void;
  openPreferences: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent() {
  const value = use(ConsentContext);
  if (!value) throw new Error("useConsent must be used within ConsentProvider");
  return value;
}

function readCookie(): ConsentState | null {
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(entry?.slice(CONSENT_COOKIE.length + 1));
}

function writeCookie(categories: ConsentCategories) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't available in every supported browser
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(categories)}; Path=/; Max-Age=${
    CONSENT_MAX_AGE_DAYS * 24 * 60 * 60
  }; SameSite=Lax${secure}`;
}

const ANALYTICS_PREFIXES = ["ph_", "__ph"];
const isAnalyticsKey = (name: string) => ANALYTICS_PREFIXES.some((prefix) => name.startsWith(prefix));

/**
 * Removes storage left by PostHog when analytics consent is absent or
 * withdrawn. Cookies are expired for every domain scope PostHog may use.
 */
function clearAnalyticsStorage() {
  const host = window.location.hostname;
  const domains = [
    "",
    `; Domain=${host}`,
    `; Domain=.${host}`,
    `; Domain=.${host.split(".").slice(-2).join(".")}`,
  ];
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0] ?? "";
    if (!isAnalyticsKey(name)) continue;
    for (const domain of domains) {
      // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API isn't available in every supported browser
      document.cookie = `${name}=; Path=/; Max-Age=0${domain}`;
    }
  }
  try {
    for (const key of Object.keys(localStorage)) if (isAnalyticsKey(key)) localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage)) if (isAnalyticsKey(key)) sessionStorage.removeItem(key);
  } catch {
    // Storage unavailable.
  }
}

/**
 * Cookie consent (GDPR / ePrivacy / LGPD): optional services (browser error
 * monitoring, product analytics) load only after an explicit opt-in; nothing
 * optional runs before a choice. Withdrawing reloads the page so their SDKs
 * are gone. Signed-in choices are also recorded on the account.
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => configuredOptionalServices(), []);
  const hasOptional = services.errors || services.analytics;
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [ready, setReady] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const started = useRef({ errors: false, analytics: false });

  const start = useCallback(
    async (state: ConsentCategories) => {
      if (state.errors && services.errors && !started.current.errors) {
        started.current.errors = true;
        const Sentry = await import("@sentry/nextjs");
        Sentry.init({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          tracesSampleRate: 0.1,
          dataCollection: sentryDataCollection,
        });
      }
      if (state.analytics && services.analytics && !started.current.analytics) {
        started.current.analytics = true;
        const { default: posthog } = await import("posthog-js");
        posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "", {
          api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
          defaults: "2026-08-30",
          person_profiles: "identified_only",
          capture_pageview: "history_change",
        });
      }
    },
    [services],
  );

  useEffect(() => {
    const saved = readCookie();
    setConsent(saved);
    setReady(true);
    // Without analytics consent, no analytics storage may remain (e.g. after withdrawal).
    if (!saved?.analytics) clearAnalyticsStorage();
    if (saved) void start(saved);
  }, [start]);

  const decide = useCallback(
    (categories: ConsentCategories) => {
      const previous = consent;
      writeCookie(categories);
      const next = readCookie();
      setConsent(next);
      setDialogOpen(false);
      // Best effort: record on the account when signed in (ignored otherwise).
      void saveConsent(categories).catch(() => {});
      const withdrawn =
        (started.current.errors && !categories.errors) ||
        (started.current.analytics && !categories.analytics);
      if (withdrawn) {
        if (started.current.analytics && !categories.analytics) {
          void import("posthog-js").then(({ default: posthog }) => {
            posthog.opt_out_capturing();
            clearAnalyticsStorage();
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
        return;
      }
      if (!previous || categories.errors || categories.analytics) void start(categories);
    },
    [consent, start],
  );

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, services, decide, openPreferences: () => setDialogOpen(true) }),
    [consent, services, decide],
  );

  return (
    <ConsentContext value={value}>
      {children}
      {ready && hasOptional && !consent ? <ConsentBanner /> : null}
      <ConsentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </ConsentContext>
  );
}
