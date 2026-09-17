"use client";

import { type AppLocale, DEFAULT_LOCALE, htmlLanguage } from "@/i18n/config";
import {
  type EmergencyCatalogs,
  emergencyCatalogs,
  localeFromEmergencyCookie,
  resolveEmergencyLocale,
} from "@/i18n/emergency-locale";
import { DEFAULT_TIME_ZONE, formats } from "@/i18n/formats";
import { type AbstractIntlMessages, NextIntlClientProvider } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

type EmergencyMessagesProviderProps = {
  activeLocales?: readonly AppLocale[];
  catalogs?: EmergencyCatalogs;
  children: ReactNode;
  /** A locale the server already resolved, e.g. from a `/ja/` URL prefix on a 404. */
  initialLocale?: AppLocale;
};

/** Provides the compact catalog used when an error boundary cannot trust its parent tree. */
export function EmergencyMessagesProvider({
  activeLocales,
  catalogs = emergencyCatalogs,
  children,
  initialLocale,
}: Readonly<EmergencyMessagesProviderProps>) {
  const [locale, setLocale] = useState<AppLocale>(
    resolveEmergencyLocale({ activeLocales, catalogs, explicitLocale: initialLocale }),
  );

  // Cookie and document language are browser synchronization outside React's tree.
  useEffect(() => {
    const cookieLocale = localeFromEmergencyCookie(document.cookie);
    setLocale(
      resolveEmergencyLocale({
        activeLocales,
        catalogs,
        cookieLocale,
        // A URL that names its locale outranks a stale cookie from another language.
        explicitLocale: initialLocale,
      }),
    );
  }, [activeLocales, catalogs, initialLocale]);

  useEffect(() => {
    document.documentElement.lang = htmlLanguage(locale);
  }, [locale]);

  const messages = catalogs[locale] ?? catalogs[DEFAULT_LOCALE] ?? emergencyCatalogs.en;

  return (
    <NextIntlClientProvider
      formats={formats}
      locale={locale}
      messages={messages as AbstractIntlMessages}
      timeZone={DEFAULT_TIME_ZONE}
    >
      {children}
    </NextIntlClientProvider>
  );
}
