import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Locale comes from the `[locale]` root param. Server Actions, route handlers
 * and emails cannot read root params, so they pass `locale` explicitly
 * (`getTranslations({ locale })`), which arrives here as `params.locale`.
 *
 * The time zone is fixed to UTC here so this config stays request-agnostic and
 * pages keep a static shell; app screens pass the signed-in user's time zone
 * to each formatter call instead.
 */
export default getRequestConfig(async (params) => {
  const requested = params.locale ?? (await rootParams.locale());
  if (!hasLocale(routing.locales, requested)) notFound();

  return {
    locale: requested,
    messages: (await import(`../messages/${requested}.json`)).default,
    timeZone: "UTC",
  };
});
