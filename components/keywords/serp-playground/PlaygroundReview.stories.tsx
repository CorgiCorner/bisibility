import { storyLocale } from "@/.storybook/story-locale";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import type { ComparisonPreview } from "@/lib/provider-comparison/types";
import en from "@/messages/core/en/project-rank-tracker.json";
import shared from "@/messages/core/en/shared.json";
import es from "@/messages/core/es-ES/project-rank-tracker.json";
import ja from "@/messages/core/ja/project-rank-tracker.json";
import pl from "@/messages/core/pl/project-rank-tracker.json";
import type { Meta, StoryObj } from "@storybook/react";
import { PlaygroundReview } from "./PlaygroundReview";

const keyword = {
  id: "",
  text: "best coffee grinder",
  device: "desktop" as const,
  locationLabel: "United States",
};
const preview: ComparisonPreview = {
  id: "preview",
  hash: "hash",
  expiresAt: "2026-11-09T10:05:00Z",
  depth: 20 as const,
  keyword,
  sides: [
    {
      provider: "dataforseo" as const,
      estimatedCostCents: 0.2,
      nativeUnit: "cents",
      nativeQuantity: 0.2,
      fundingSource: "own" as const,
    },
    {
      provider: "serpapi" as const,
      estimatedCostCents: 1,
      nativeUnit: "searches",
      nativeQuantity: 1,
      fundingSource: "own" as const,
    },
  ],
};
const meta = {
  title: "Keywords/SERP Playground/Cost review",
  component: PlaygroundReview,
  decorators: [
    (Story, context) => {
      const locale = storyLocale(context.globals.locale);
      return (
        <FeatureMessagesProvider
          locale={locale}
          timeZone="UTC"
          messages={{ ...shared, ...{ en, pl, "es-ES": es, ja }[locale] }}
        >
          <Story />
        </FeatureMessagesProvider>
      );
    },
  ],
  args: {
    review: { preview },
    busy: false,
    onClose: () => {},
    launch: () => {},
    openPrevious: () => {},
  },
} satisfies Meta<typeof PlaygroundReview>;
export default meta;
export const NewSearch: StoryObj<typeof meta> = {};
export const RepeatedSearch: StoryObj<typeof meta> = {
  args: {
    review: {
      preview,
      previous: {
        id: "previous",
        createdAt: "2026-11-09T14:32:07Z",
        keyword,
        depth: 20,
        sides: [],
      },
    },
  },
};
