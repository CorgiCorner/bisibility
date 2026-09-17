import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { loadCoreMessages } from "./catalog-loader.server";
import { type AppLocale, DEFAULT_LOCALE, parseActiveLocale } from "./config";
import { DEFAULT_TIME_ZONE, formats } from "./formats";

/**
 * Builds a request config from an explicit locale and namespace payload. Route
 * boundaries own locale resolution so this static root config never reads request APIs.
 */
export function createIntlRequestConfig(locale: AppLocale, messages: AbstractIntlMessages) {
  return { formats, locale, messages, timeZone: DEFAULT_TIME_ZONE };
}

// Document roots may supply this value with setRequestLocale, without this config
// independently reading cookies, headers, or session state. Server-rendered UI
// must use createIntlTranslator with its document runtime: RSC siblings can be
// scheduled independently, so they cannot rely on a parent setter for correctness.
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = parseActiveLocale(await requestLocale) ?? DEFAULT_LOCALE;
  return createIntlRequestConfig(locale, await loadCoreMessages(locale, ["shared"]));
});
