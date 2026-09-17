import { type AppLocale, parseLocale } from "@/i18n/config";
import { validateReturnTo } from "@/lib/auth/return-to";

export const LOCALE_HANDOFF_PATH = "/locale/handoff";
const DEFAULT_HANDOFF_TARGET = "/login";

/**
 * Carries an explicit marketing selection to the regional app host. The route
 * handler writes the existing host-only UI cookie after the proxy redirect.
 */
export function localeHandoffHref(locale: AppLocale, next = DEFAULT_HANDOFF_TARGET) {
  const params = new URLSearchParams({
    locale,
    next: validateReturnTo(next) ?? DEFAULT_HANDOFF_TARGET,
  });
  return `${LOCALE_HANDOFF_PATH}?${params}`;
}

export function resolveLocaleHandoff(input: { locale: unknown; next: unknown }) {
  const locale = parseLocale(input.locale);
  if (!locale) return null;
  return { locale, next: validateReturnTo(input.next) ?? DEFAULT_HANDOFF_TARGET };
}
