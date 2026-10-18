import "server-only";

import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { type ActiveLocale, assertActiveLocale } from "@/i18n/config";
import type { CoreMessages } from "@/i18n/core-messages.generated";
import { getAnonymousLocalePreference } from "@/i18n/request-locale.server";
import { getSessionReference } from "@/lib/auth/session";
import { isTransientDatabaseReadError } from "@/lib/db/transient-read";
import { getLocalePreferenceForUser } from "@/lib/queries/account";
import { cache } from "react";
import { DEFAULT_TIME_ZONE, type IntlTranslationContext } from "./formats";

const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

export type DocumentLocaleRuntime = {
  locale: ActiveLocale;
  messages: Pick<CoreMessages, "shared">;
  timeZone: IntlTranslationContext["timeZone"];
};

async function runtimeFor(locale: ActiveLocale): Promise<DocumentLocaleRuntime> {
  return {
    locale,
    messages: await loadCoreMessages(locale, ["shared"]),
    timeZone: DEFAULT_TIME_ZONE,
  };
}

/** Dynamic auth and hosted-marketing document roots use anonymous request preference. */
export const resolveAnonymousDocumentLocale = perRequestCache(async () => {
  return runtimeFor((await getAnonymousLocalePreference()).locale);
});

/**
 * The regional root resolves session and profile preference once. Child layouts
 * use the same cached preference function when they need feature namespaces.
 */
export const resolveRegionalDocumentLocale = perRequestCache(async () => {
  const session = await getSessionReference();
  if (session) {
    try {
      return runtimeFor((await getLocalePreferenceForUser(session.user.id)).locale);
    } catch (error) {
      if (!isTransientDatabaseReadError(error)) throw error;
      // Locale is a display preference; account authorization remains with the route.
    }
  }
  return runtimeFor((await getAnonymousLocalePreference()).locale);
});

/** A prefixed marketing route is URL-owned and does not need a request read. */
export async function resolveUrlDocumentLocale(value: string) {
  return runtimeFor(assertActiveLocale(value));
}
