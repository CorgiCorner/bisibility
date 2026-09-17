import "server-only";

import { cookies, headers } from "next/headers";
import { resolveViewerLocale, UI_LOCALE_COOKIE } from "./config";

export function resolveAnonymousLocale(input: {
  acceptLanguage?: string | null;
  cookieLocale?: unknown;
}) {
  return resolveViewerLocale(input);
}

/** Reads anonymous request preferences only at auth and other dynamic route boundaries. */
export async function getAnonymousLocalePreference() {
  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolveAnonymousLocale({
    acceptLanguage: requestHeaders.get("accept-language"),
    cookieLocale: store.get(UI_LOCALE_COOKIE)?.value,
  });
}
