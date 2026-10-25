import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import m01 from "@/messages/core/en/instance-admin.json";
import m00 from "@/messages/core/en/shared.json";
import m31 from "@/messages/core/es-ES/instance-admin.json";
import m30 from "@/messages/core/es-ES/shared.json";
import m21 from "@/messages/core/ja/instance-admin.json";
import m20 from "@/messages/core/ja/shared.json";
import m11 from "@/messages/core/pl/instance-admin.json";
import m10 from "@/messages/core/pl/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";
import { storyLocale, storyTimeZone } from "./story-locale";

const messages = {
  en: mergeMessageCatalogs(m00, m01),
  pl: mergeMessageCatalogs(m10, m11),
  ja: mergeMessageCatalogs(m20, m21),
  "es-ES": mergeMessageCatalogs(m30, m31),
};
export const withRecoveryMessages: Decorator = (Story, context) => {
  const locale = storyLocale(context.globals.locale ?? context.parameters.recoveryLocale);
  return (
    <FeatureMessagesProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={storyTimeZone(context.globals.timeZone)}
    >
      <div className="mx-auto max-w-7xl p-6">
        <Story />
      </div>
    </FeatureMessagesProvider>
  );
};
