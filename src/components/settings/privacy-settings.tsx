"use client";

import { Cookie, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useConsent } from "@/components/consent/consent-provider";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Settings → Privacy: consent management and data portability. */
export function PrivacySettings() {
  const t = useTranslations("settings");
  const consent = useTranslations("consent");
  const { openPreferences } = useConsent();
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("cookiePreferences")}</p>
          <p className="text-sm text-muted-foreground">{t("cookiePreferencesHint")}</p>
        </div>
        <Button variant="outline" onClick={openPreferences} className="shrink-0">
          <Cookie /> {consent("settingsLink")}
        </Button>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("exportData")}</p>
          <p className="text-sm text-muted-foreground">{t("exportDataHint")}</p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <a href="/api/account/export" download data-testid="export-data">
            <Download /> {t("exportData")}
          </a>
        </Button>
      </div>
      <Button asChild variant="link" className="px-0">
        <Link href="/legal/privacy">{t("privacyRights")}</Link>
      </Button>
    </div>
  );
}
