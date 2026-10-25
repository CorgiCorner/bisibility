import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import m02 from "@/messages/core/en/project-settings-notifications.json";
import m01 from "@/messages/core/en/project-settings-shell.json";
import m00 from "@/messages/core/en/shared.json";
import m32 from "@/messages/core/es-ES/project-settings-notifications.json";
import m31 from "@/messages/core/es-ES/project-settings-shell.json";
import m30 from "@/messages/core/es-ES/shared.json";
import m22 from "@/messages/core/ja/project-settings-notifications.json";
import m21 from "@/messages/core/ja/project-settings-shell.json";
import m20 from "@/messages/core/ja/shared.json";
import m12 from "@/messages/core/pl/project-settings-notifications.json";
import m11 from "@/messages/core/pl/project-settings-shell.json";
import m10 from "@/messages/core/pl/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";
import { storyLocale, storyTimeZone } from "./story-locale";

const messages = {
  en: mergeMessageCatalogs(m00, m01, m02),
  pl: mergeMessageCatalogs(m10, m11, m12),
  ja: mergeMessageCatalogs(m20, m21, m22),
  "es-ES": mergeMessageCatalogs(m30, m31, m32),
};
export const withNotificationSettingsMessages: Decorator = (Story, context) => {
  const locale = storyLocale(context.globals.locale);
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
