import "server-only";
import { routing } from "@/i18n/routing";
import { publicLocales } from "@/server/env";

/**
 * Picks the best public locale for an Accept-Language header. Only locales
 * listed in PUBLIC_LOCALES are eligible so hidden test locales never leak.
 */
export function negotiateLocale(acceptLanguage: string | null): string {
  const available = routing.locales.filter((locale) => publicLocales.includes(locale));
  if (!acceptLanguage) return routing.defaultLocale;
  const requested = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of requested) {
    const exact = available.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;
    const base = available.find((locale) => locale.toLowerCase().split("-")[0] === tag.split("-")[0]);
    if (base) return base;
  }
  return routing.defaultLocale;
}
