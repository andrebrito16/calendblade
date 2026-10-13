import { defineRouting } from "next-intl/routing";

/**
 * `pt-BR` stays routable for translation testing; the locale switcher only
 * offers locales listed in PUBLIC_LOCALES.
 */
export const routing = defineRouting({
  locales: ["en", "pt-BR"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
