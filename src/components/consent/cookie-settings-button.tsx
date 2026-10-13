"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useConsent } from "./consent-provider";

/** "Cookie settings" link-styled button (footers): reopens the preferences. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("consent");
  const { openPreferences } = useConsent();
  return (
    <button type="button" onClick={openPreferences} className={cn("text-left", className)}>
      {t("settingsLink")}
    </button>
  );
}
