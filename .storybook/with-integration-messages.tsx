import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-integrations.json";
import enShared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-integrations.json";
import esShared from "@/messages/core/es-ES/shared.json";
import ja from "@/messages/core/ja/project-integrations.json";
import jaShared from "@/messages/core/ja/shared.json";
import pl from "@/messages/core/pl/project-integrations.json";
import plShared from "@/messages/core/pl/shared.json";
import type { Decorator } from "@storybook/react";
import { storyLocale, storyTimeZone } from "./story-locale";

export const withIntegrationMessages: Decorator = (Story, context) => {
  const locale = storyLocale(context.globals.locale);
  const messages = {
    en: { ...enShared, ...en },
    pl: { ...plShared, ...pl },
    ja: { ...jaShared, ...ja },
    "es-ES": { ...esShared, ...es },
  };
  return (
    <FeatureMessagesProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={storyTimeZone(context.globals.timeZone)}
    >
      <Story />
    </FeatureMessagesProvider>
  );
};
