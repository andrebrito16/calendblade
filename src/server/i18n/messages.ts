import "server-only";
import { createFormatter, createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import en from "@/messages/en.json";
import ptBR from "@/messages/pt-BR.json";

const catalogs = { en, "pt-BR": ptBR } as const;

export function resolveLocale(locale: string | null | undefined) {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

/**
 * Translator usable outside the request lifecycle (cron, webhooks, emails,
 * the sync engine), where next-intl's request config is not available.
 */
export function getServerTranslator(locale: string | null | undefined) {
  const resolved = resolveLocale(locale);
  return createTranslator({ locale: resolved, messages: catalogs[resolved] });
}

export function getServerFormatter(locale: string | null | undefined, timeZone = "UTC") {
  return createFormatter({ locale: resolveLocale(locale), timeZone });
}
