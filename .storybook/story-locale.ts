import type { AppLocale } from "@/i18n/config";
export function storyLocale(value: unknown): AppLocale {
  return value === "pl" || value === "ja" || value === "es-ES" ? value : "en";
}

const storyTimeZones = ["UTC", "Europe/Warsaw", "Asia/Tokyo"];
/** Storybook's URL sanitizer drops slashes; accept only the toolbar's explicit zone values. */
export function storyTimeZone(
  value: unknown,
  search = typeof window === "undefined" ? "" : window.location.search,
): string {
  const requested = new URLSearchParams(search)
    .get("globals")
    ?.split(";")
    .find((part) => part.startsWith("timeZone:"))
    ?.slice("timeZone:".length);
  if (requested && storyTimeZones.includes(requested)) return requested;
  return typeof value === "string" && storyTimeZones.includes(value) ? value : "UTC";
}
