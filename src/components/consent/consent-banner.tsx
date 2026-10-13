"use client";

import { Cookie } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useConsent } from "./consent-provider";

/**
 * Non-blocking first-visit banner. "Reject all" and "Accept all" have equal
 * prominence, as EU regulators require.
 */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const { decide, openPreferences } = useConsent();
  return (
    <section
      aria-label={t("bannerLabel")}
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
      data-testid="consent-banner"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-xl border bg-background p-4 shadow-lg sm:p-5 md:flex-row md:items-center">
        <div className="flex flex-1 gap-3">
          <Cookie className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t("title")}</p>
            <p className="text-muted-foreground">
              {t.rich("body", {
                cookies: (chunks) => (
                  <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-foreground">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row md:shrink-0">
          <Button variant="ghost" onClick={openPreferences}>
            {t("customize")}
          </Button>
          <Button variant="outline" onClick={() => decide({ errors: false, analytics: false })}>
            {t("rejectAll")}
          </Button>
          <Button variant="outline" onClick={() => decide({ errors: true, analytics: true })}>
            {t("acceptAll")}
          </Button>
        </div>
      </div>
    </section>
  );
}
