import { storyLocale } from "@/.storybook/story-locale";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-rank-tracker.json";
import shared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-rank-tracker.json";
import ja from "@/messages/core/ja/project-rank-tracker.json";
import pl from "@/messages/core/pl/project-rank-tracker.json";
import type { Meta, StoryObj } from "@storybook/react";
import { SerpPlayground } from "./SerpPlayground";

const meta = {
  title: "Keywords/SERP Playground",
  component: SerpPlayground,
  decorators: [
    (Story, context) => {
      const locale = storyLocale(context.globals.locale);
      return (
        <FeatureMessagesProvider
          locale={locale}
          timeZone="UTC"
          messages={{ ...shared, ...{ en, pl, "es-ES": es, ja }[locale] }}
        >
          <div className="mx-auto max-w-[1200px] p-5">
            <Story />
          </div>
        </FeatureMessagesProvider>
      );
    },
  ],
  args: {
    projectRef: "prj_fixture",
    data: {
      canRun: true,
      providers: [
        { provider: "dataforseo", ready: false },
        { provider: "serpapi", ready: false },
      ],
      location: {
        kind: "country",
        canonicalKey: "US",
        countryCode: "US",
        displayName: "United States",
        languageCode: "en",
        languageLabel: "English",
      },
      history: [],
    },
  },
} satisfies Meta<typeof SerpPlayground>;
export default meta;
export const Empty: StoryObj<typeof meta> = {};
