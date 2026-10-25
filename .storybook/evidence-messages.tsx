import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import m01 from "@/messages/core/en/project-rank-tracker.json";
import m04 from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import m03 from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import m02 from "@/messages/core/en/project-runs.json";
import m00 from "@/messages/core/en/shared.json";
import m31 from "@/messages/core/es-ES/project-rank-tracker.json";
import m34 from "@/messages/core/es-ES/project-rank-tracker-keyword-detail.json";
import m33 from "@/messages/core/es-ES/project-rank-tracker-keyword-import.json";
import m32 from "@/messages/core/es-ES/project-runs.json";
import m30 from "@/messages/core/es-ES/shared.json";
import m21 from "@/messages/core/ja/project-rank-tracker.json";
import m24 from "@/messages/core/ja/project-rank-tracker-keyword-detail.json";
import m23 from "@/messages/core/ja/project-rank-tracker-keyword-import.json";
import m22 from "@/messages/core/ja/project-runs.json";
import m20 from "@/messages/core/ja/shared.json";
import m11 from "@/messages/core/pl/project-rank-tracker.json";
import m14 from "@/messages/core/pl/project-rank-tracker-keyword-detail.json";
import m13 from "@/messages/core/pl/project-rank-tracker-keyword-import.json";
import m12 from "@/messages/core/pl/project-runs.json";
import m10 from "@/messages/core/pl/shared.json";
import type { Decorator } from "@storybook/nextjs-vite";
import { storyLocale, storyTimeZone } from "./story-locale";

const messages = {
  en: mergeMessageCatalogs(m00, m01, m02, m03, m04),
  pl: mergeMessageCatalogs(m10, m11, m12, m13, m14),
  ja: mergeMessageCatalogs(m20, m21, m22, m23, m24),
  "es-ES": mergeMessageCatalogs(m30, m31, m32, m33, m34),
};
export const withEvidenceMessages: Decorator = (Story, context) => {
  const locale = storyLocale(context.globals.locale);
  return (
    <FeatureMessagesProvider
      locale={locale}
      messages={messages[locale]}
      timeZone={storyTimeZone(context.globals.timeZone)}
    >
      <DateDisplayProvider>
        <Story
          args={{
            ...context.args,
            ...("timeZone" in context.args
              ? { timeZone: storyTimeZone(context.globals.timeZone) }
              : {}),
          }}
        />
      </DateDisplayProvider>
    </FeatureMessagesProvider>
  );
};
