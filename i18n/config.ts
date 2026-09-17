export const localeValues = ["en", "es-ES", "ja", "pl"] as const;
export type AppLocale = (typeof localeValues)[number];

/** Native language names are display data, never a locale activation switch. */
export const localeAutonyms: Record<AppLocale, string> = {
  en: "English",
  "es-ES": "Español (España)",
  ja: "日本語",
  pl: "Polski",
};

// Activation requires a complete, parity-checked catalog for every listed locale.
// Keeping the supported set separate prevents a partial catalog from being
// selected at runtime, so a new language stays out of this list until it passes
// `npm run check:i18n-catalogs`.
export const activeLocaleValues = ["en", "es-ES", "ja", "pl"] as const;
export type ActiveLocale = (typeof activeLocaleValues)[number];

// Declared as its literal type: callers derive "every locale except the default"
// from it, which collapses to never when the annotation widens to ActiveLocale.
export const DEFAULT_LOCALE = "en" as const satisfies ActiveLocale;
export const UI_LOCALE_COOKIE = "bisibility_locale";

const intlLocales: Record<AppLocale, string> = {
  en: "en-US",
  "es-ES": "es-ES",
  ja: "ja-JP",
  pl: "pl-PL",
};

export type LocaleResolutionSource = "cookie" | "default" | "header" | "pending" | "persisted";

export type LocaleResolution = {
  configuredLocale: AppLocale | null;
  locale: ActiveLocale;
  source: LocaleResolutionSource;
};

function inList<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

export function parseLocale(value: unknown): AppLocale | undefined {
  return inList(localeValues, value) ? value : undefined;
}

export function parseActiveLocale(value: unknown): ActiveLocale | undefined {
  return inList(activeLocaleValues, value) ? value : undefined;
}

export function assertActiveLocale(value: unknown): ActiveLocale {
  const locale = parseActiveLocale(value);
  if (!locale) throw new Error("Unsupported UI locale.");
  return locale;
}

/**
 * Marketing URLs carry a lowercase, language-only segment. The locale code stays internal:
 * catalogs, the cookie and Intl formatting keep `es-ES` while its pages live under `/es`.
 */
const localeUrlSegments: Record<AppLocale, string> = {
  en: "en",
  "es-ES": "es",
  ja: "ja",
  pl: "pl",
};

export function localeUrlSegment(locale: AppLocale): string {
  return localeUrlSegments[locale];
}

const localeByUrlSegment = new Map<string, ActiveLocale>(
  activeLocaleValues.map((locale) => [localeUrlSegments[locale], locale]),
);

/** Only the canonical segment resolves; any other spelling is redirected to it before routing. */
export function parseLocaleUrlSegment(value: unknown): ActiveLocale | undefined {
  return typeof value === "string" ? localeByUrlSegment.get(value) : undefined;
}

// One spelling per prefixed URL. Every case variant of an active segment, and of the locale code
// it stands for, names the same pages, so the duplicates redirect instead of competing for rank.
const canonicalSegmentByAlias = new Map<string, string>(
  activeLocaleValues
    .filter((locale) => locale !== DEFAULT_LOCALE)
    .flatMap((locale): [string, string][] => {
      const segment = localeUrlSegments[locale];
      return [
        [segment, segment],
        [locale.toLowerCase(), segment],
      ];
    }),
);

/** The canonical segment behind a spelling of an active prefix, or undefined when it names none. */
export function canonicalLocaleUrlSegment(value: string): string | undefined {
  return canonicalSegmentByAlias.get(value.toLowerCase());
}

export function intlLocale(locale: AppLocale): string {
  return intlLocales[locale];
}

/** The document language keeps the configured BCP 47 language tag, not its formatting alias. */
export function htmlLanguage(locale: AppLocale): AppLocale {
  return locale;
}

function localeFromLanguageRange(value: string): AppLocale | undefined {
  const language = value.toLowerCase().split("-", 1)[0];
  if (language === "es") return "es-ES";
  if (language === "en") return "en";
  if (language === "ja") return "ja";
  if (language === "pl") return "pl";
  return undefined;
}

function acceptedLocale(header: string | null | undefined): AppLocale | undefined {
  if (!header) return undefined;

  const candidates = header
    .split(",")
    .map((entry, index) => {
      const [languageRange = "", ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const qualityValue = qualityParameter?.trim().slice(2);
      const quality = qualityValue === undefined ? 1 : Number(qualityValue);
      return {
        index,
        locale: localeFromLanguageRange(languageRange),
        quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0,
      };
    })
    .filter(
      (candidate): candidate is { index: number; locale: AppLocale; quality: number } =>
        Boolean(candidate.locale) && candidate.quality > 0,
    )
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  return candidates[0]?.locale;
}

function effectiveLocale(locale: AppLocale, source: LocaleResolutionSource): LocaleResolution {
  const active = parseActiveLocale(locale);
  if (active) return { configuredLocale: locale, locale: active, source };

  return { configuredLocale: locale, locale: DEFAULT_LOCALE, source: "pending" };
}

/**
 * Resolves one request without retaining state between callers. A persisted
 * locale becomes authoritative only after a deliberate selection was saved.
 */
export function resolveViewerLocale(input: {
  acceptLanguage?: string | null;
  cookieLocale?: unknown;
  persistedLocale?: unknown;
  persistedLocaleSelectedAt?: Date | null;
}): LocaleResolution {
  const persisted = parseLocale(input.persistedLocale);
  if (persisted && input.persistedLocaleSelectedAt) {
    return effectiveLocale(persisted, "persisted");
  }

  const cookie = parseLocale(input.cookieLocale);
  if (cookie) return effectiveLocale(cookie, "cookie");

  const header = acceptedLocale(input.acceptLanguage);
  if (header) return effectiveLocale(header, "header");

  return { configuredLocale: null, locale: DEFAULT_LOCALE, source: "default" };
}
