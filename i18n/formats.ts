import { type AppLocale, intlLocale } from "./config";

/** Document-level formatters must never fall back to the server or browser timezone. */
export const DEFAULT_TIME_ZONE = "UTC";

export type IntlTranslationContext = {
  timeZone: string;
};

export const formats = {
  dateTime: {
    concise: { day: "numeric", month: "short", year: "numeric" },
    dateTime: {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      year: "numeric",
    },
  },
  number: {
    compact: { notation: "compact" },
    percent: { style: "percent" },
  },
} as const;

export type LocaleFormatContext = {
  locale: AppLocale;
  timeZone: IntlTranslationContext["timeZone"];
};

export function formatCurrency(value: number, currency: string, locale: AppLocale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    currency,
    style: "currency",
  }).format(value);
}

export function formatDateTime(value: Date, context: LocaleFormatContext) {
  return new Intl.DateTimeFormat(intlLocale(context.locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.timeZone,
  }).format(value);
}

export function formatNumber(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}
