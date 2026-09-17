import type { AppLocale } from "@/i18n/config";
import { formats, type IntlTranslationContext } from "@/i18n/formats";
import { type AbstractIntlMessages, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

type FeatureMessagesProviderProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
  timeZone: IntlTranslationContext["timeZone"];
};

/** A neutral boundary serializes only its messages and receives the document timezone. */
export function FeatureMessagesProvider({
  children,
  locale,
  messages,
  timeZone,
}: Readonly<FeatureMessagesProviderProps>) {
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
