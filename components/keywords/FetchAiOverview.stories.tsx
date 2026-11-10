import { storyLocale } from "@/.storybook/story-locale";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import en from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import shared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-rank-tracker-keyword-detail.json";
import ja from "@/messages/core/ja/project-rank-tracker-keyword-detail.json";
import pl from "@/messages/core/pl/project-rank-tracker-keyword-detail.json";
import type { Meta, StoryObj } from "@storybook/react";
import { FetchAiOverview } from "./FetchAiOverview";

const meta = {
  title: "Keywords/Fetch AI overview",
  component: FetchAiOverview,
  decorators: [
    (Story, context) => {
      const locale = storyLocale(context.globals.locale);
      const messages = { en, pl, "es-ES": es, ja }[locale];
      return (
        <FeatureMessagesProvider
          locale={locale}
          timeZone="UTC"
          messages={{ ...shared, ...messages }}
        >
          <div className="mx-auto max-w-[560px] p-6">
            <Story />
          </div>
        </FeatureMessagesProvider>
      );
    },
  ],
  args: { projectRef: "prj_fixture", target: { kind: "check", checkId: "check_abcdefgh" } },
} satisfies Meta<typeof FetchAiOverview>;
export default meta;
export const Confirmation: StoryObj<typeof meta> = {};
