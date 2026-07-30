import type { Meta, StoryObj } from "@storybook/react";
import { KeywordSuggestionDrawer, type SuggestionCostContext } from "./KeywordSuggestionDrawer";

const costContext: SuggestionCostContext = {
  cronExpression: null,
  depth: 100,
  deviceCount: 2,
  frequency: "daily",
  locationCount: 1,
  overrideCents: 200,
  providerId: "dataforseo",
};

const suggestions = [
  { clicks: 128, impressions: 4200, query: "keyword tracking api" },
  { clicks: 96, impressions: 3100, query: "rank tracker" },
  { clicks: 74, impressions: 2600, query: "serp api" },
  { clicks: 51, impressions: 1800, query: "ai visibility tool" },
  { clicks: 30, impressions: 1500, query: "seo dashboard" },
  { clicks: 12, impressions: 900, query: "google rank checker" },
];

const meta = {
  title: "Keywords/KeywordSuggestionDrawer",
  component: KeywordSuggestionDrawer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof KeywordSuggestionDrawer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    costContext,
    existingKeywords: ["rank tracker"],
    hidden: [{ query: "-site:reddit.com ai visibility" }, { query: "site:" }],
    onClose: () => undefined,
    onConfirm: () => undefined,
    open: true,
    suggestions,
  },
};

export const NothingHidden: Story = {
  args: {
    ...Default.args,
    hidden: [],
  },
};
