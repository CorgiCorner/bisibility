import "server-only";

import { type ActiveLocale, parseLocaleUrlSegment } from "@/i18n/config";
import { RETURN_TO_REQUEST_HEADER } from "@/lib/auth/return-to";
import { headers } from "next/headers";

/** Reads the locale a URL segment declares, e.g. `/es/anything` -> `es-ES`. */
export function localeFromPath(pathname: string | null | undefined): ActiveLocale | undefined {
  const segment = pathname?.split("?", 1)[0]?.split("/")[1];
  return segment ? (parseLocaleUrlSegment(segment) ?? undefined) : undefined;
}

/**
 * A prefixed URL owns its locale even on a cold, cookie-less request - which is exactly what a
 * search result pointing at a dead `/ja/` URL is. The proxy records the request path, so a
 * boundary that cannot read route params (the not-found boundary) still resolves it.
 */
export async function resolvePathLocale(): Promise<ActiveLocale | undefined> {
  return localeFromPath((await headers()).get(RETURN_TO_REQUEST_HEADER));
}
