"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { updateLocale } from "@/server/actions/settings";

/** Shown only when more than one locale is public (PUBLIC_LOCALES). */
export function LocaleSelect({ locales }: { locales: string[] }) {
  const t = useTranslations("settings");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const names = new Intl.DisplayNames([current], { type: "language" });

  return (
    <div className="space-y-2">
      <Label htmlFor="settings-locale">{t("language")}</Label>
      <Select
        value={current}
        disabled={pending}
        onValueChange={(next) =>
          startTransition(async () => {
            if (handle(await updateLocale(next), t("saved"))) {
              router.replace(pathname, { locale: next as AppLocale });
            }
          })
        }
      >
        <SelectTrigger id="settings-locale" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {names.of(locale) ?? locale}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
