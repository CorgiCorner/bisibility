import {
  type AppLocale,
  activeLocaleValues,
  DEFAULT_LOCALE,
  parseLocale,
  UI_LOCALE_COOKIE,
} from "@/i18n/config";
import emergencyEnglishMessages from "@/messages/emergency/en.json";
import emergencySpanishMessages from "@/messages/emergency/es-ES.json";
import emergencyJapaneseMessages from "@/messages/emergency/ja.json";
import emergencyPolishMessages from "@/messages/emergency/pl.json";
import type { AbstractIntlMessages } from "next-intl";

export type EmergencyCatalogs = Partial<Record<AppLocale, AbstractIntlMessages>>;

/**
 * Global error replaces the document root, so it ships only this small catalog,
 * statically: one compact file per active locale, never a feature catalog. A locale
 * without an entry here renders in English instead of loading anything at crash time.
 */
export const emergencyCatalogs: EmergencyCatalogs = {
  en: emergencyEnglishMessages,
  "es-ES": emergencySpanishMessages,
  ja: emergencyJapaneseMessages,
  pl: emergencyPolishMessages,
};

export function localeFromEmergencyCookie(cookieHeader: string | undefined): AppLocale | undefined {
  const value = cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("=", 2))
    .find(([name]) => name === UI_LOCALE_COOKIE)?.[1];

  if (!value) return undefined;
  try {
    return parseLocale(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}

/**
 * Uses an explicit selection first, then the host-only locale cookie. A locale is
 * only usable once both the application and this emergency catalog activate it, so a
 * locale whose emergency catalog is missing keeps rendering the English baseline.
 */
export function resolveEmergencyLocale({
  activeLocales = activeLocaleValues,
  catalogs = emergencyCatalogs,
  cookieLocale,
  explicitLocale,
}: {
  activeLocales?: readonly AppLocale[];
  catalogs?: EmergencyCatalogs;
  cookieLocale?: unknown;
  explicitLocale?: unknown;
}): AppLocale {
  for (const candidate of [parseLocale(explicitLocale), parseLocale(cookieLocale)]) {
    if (candidate && activeLocales.includes(candidate) && catalogs[candidate]) return candidate;
  }

  return DEFAULT_LOCALE;
}
