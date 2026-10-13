"use client";

import { useEffect } from "react";
import { saveConsent } from "@/server/actions/consent";
import { useConsent } from "./consent-provider";

const SYNC_KEY = "cb_consent_synced";

/**
 * Inside the signed-in app: records a choice made before signing in (cookie
 * only) on the account, once per browser session and choice.
 */
export function ConsentSync() {
  const { consent } = useConsent();
  useEffect(() => {
    if (!consent) return;
    try {
      if (sessionStorage.getItem(SYNC_KEY) === consent.decidedAt) return;
    } catch {
      // Storage unavailable: sync anyway.
    }
    void saveConsent({ errors: consent.errors, analytics: consent.analytics }).then((result) => {
      if (!result.ok) return;
      try {
        sessionStorage.setItem(SYNC_KEY, consent.decidedAt);
      } catch {
        // Ignore.
      }
    });
  }, [consent]);
  return null;
}
