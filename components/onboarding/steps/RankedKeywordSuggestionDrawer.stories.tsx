import type { Meta, StoryObj } from "@storybook/react";
import type { RankedKeywordGroup } from "./keyword-ranked-model";
import { RankedKeywordSuggestionDrawer } from "./RankedKeywordSuggestionDrawer";

const groups: RankedKeywordGroup[] = [
  {
    alreadyTracked: false,
    count: 3,
    key: "rank-tracker",
    row: {
      alreadyTracked: false,
      estimatedTraffic: 418,
      keyword: "rank tracker",
      position: 4,
      searchVolume: 3_600,
    },
  },
  {
    alreadyTracked: false,
    count: 1,
    key: "keyword-tracking-api",
    row: {
      alreadyTracked: false,
      estimatedTraffic: 182,
      keyword: "keyword tracking api",
      position: 7,
      searchVolume: 1_900,
    },
  },
  {
    alreadyTracked: true,
    count: 1,
    key: "seo-dashboard",
    row: {
      alreadyTracked: true,
      estimatedTraffic: 96,
      keyword: "seo dashboard",
      position: 2,
      searchVolume: 720,
    },
  },
  {
    alreadyTracked: false,
    count: 1,
    key: "visibility-platform",
    row: {
      alreadyTracked: false,
      estimatedTraffic: null,
      keyword: "visibility platform",
      position: null,
      searchVolume: null,
    },
  },
];

const meta = {
  component: RankedKeywordSuggestionDrawer,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Onboarding/RankedKeywordSuggestionDrawer",
} satisfies Meta<typeof RankedKeywordSuggestionDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

const args = {
  canLoad: true,
  currentKeywords: [],
  groups,
  lastPageCached: true,
  onClose: () => undefined,
  onConfirm: () => undefined,
  onLoadMore: () => undefined,
  open: true,
  pageCost: "$0.02",
  pageCount: 2,
  pending: false,
  remaining: 3,
  spentCents: 2,
};

export const Open: Story = { args };

export const ThemeDark: Story = {
  args,
  name: "theme-dark",
  parameters: { theme: "dark" },
};
