import type { AppLocale } from "@/i18n/config";
import { intlLocale } from "@/i18n/config";

export function seoMixText(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    String(values[key] ?? placeholder),
  );
}
export function seoMixMoney(cents: string | number | null, locale: AppLocale, precise = false) {
  if (cents === null) return null;
  if (typeof cents === "string" && !/^\d+(\.\d+)?$/.test(cents)) return null;
  if (!Number.isFinite(Number(cents)) || Number(cents) < 0) return null;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: precise ? 6 : 2,
  }).format(Number(cents) / 100);
}
export function seoMixDate(value: string, locale: AppLocale) {
  if (!Number.isFinite(Date.parse(value))) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) !== value)
    return null;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
