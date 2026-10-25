import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import enShared from "@/messages/core/en/shared.json";
import enShell from "@/messages/core/en/shell.json";
import esShared from "@/messages/core/es-ES/shared.json";
import esShell from "@/messages/core/es-ES/shell.json";
import jaShared from "@/messages/core/ja/shared.json";
import jaShell from "@/messages/core/ja/shell.json";
import plShared from "@/messages/core/pl/shared.json";
import plShell from "@/messages/core/pl/shell.json";
import type { Decorator } from "@storybook/nextjs-vite";
import { storyLocale, storyTimeZone } from "./story-locale";

const messages = {
  en: mergeMessageCatalogs(enShared, enShell),
  pl: mergeMessageCatalogs(plShared, plShell),
  ja: mergeMessageCatalogs(jaShared, jaShell),
  "es-ES": mergeMessageCatalogs(esShared, esShell),
};
export const withEvidenceShellMessages: Decorator = (Story, context) => {
  const locale = storyLocale(context.globals.locale);
  return (
    <FeatureMessagesProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={storyTimeZone(context.globals.timeZone)}
    >
      <Story
        args={{
          ...context.args,
          ...("timeZone" in context.args
            ? { timeZone: storyTimeZone(context.globals.timeZone) }
            : {}),
        }}
      />
    </FeatureMessagesProvider>
  );
};
