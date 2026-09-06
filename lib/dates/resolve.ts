import type { DateFormat, DateFormatPreference } from "./format";
import { DATE_FORMATS } from "./format";

function isDateFormat(value: string): value is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(value);
}

/**
 * First language tag from an Accept-Language header, ignoring q-weights.
 */
export function primaryAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const tag = header.split(",")[0]?.trim().split(";")[0]?.trim();
  return tag || null;
}

/**
 * Whether the locale writes the day before the month for a numeric date.
 * Used only to resolve `auto`; formatted month names stay English.
 */
export function localePrefersDayFirst(locale: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "numeric",
    }).formatToParts(new Date(Date.UTC(2026, 7, 24)));
    const day = parts.findIndex((part) => part.type === "day");
    const month = parts.findIndex((part) => part.type === "month");
    if (day < 0 || month < 0) return true;
    return day < month;
  } catch {
    return true;
  }
}

/**
 * Resolve a stored preference to a concrete format. `auto` reads Accept-Language
 * on the server; missing header falls back to day first.
 */
export function resolveDateFormat(
  preference: DateFormatPreference,
  acceptLanguage?: string | null,
): DateFormat {
  if (isDateFormat(preference)) return preference;
  const tag = primaryAcceptLanguage(acceptLanguage);
  if (!tag) return "day_first";
  return localePrefersDayFirst(tag) ? "day_first" : "month_first";
}
