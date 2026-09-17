"use client";

import type { AppLocale } from "@/i18n/config";
import { formats, type IntlTranslationContext } from "@/i18n/formats";
import { useHydrationMarker } from "@/lib/ui/use-hydration-marker";
import { type AbstractIntlMessages, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

type ProvidersProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
  timeZone: IntlTranslationContext["timeZone"];
};

/** Every document root passes locale, messages, and a timezone explicitly. */
export function Providers({ children, locale, messages, timeZone }: Readonly<ProvidersProps>) {
  useHydrationMarker();
  return (
    <NextIntlClientProvider
      formats={formats}
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}
