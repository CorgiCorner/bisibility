import type { Meta, StoryObj } from "@storybook/react";
import { BacklinksResults } from "./BacklinksResults";
import { emptyBacklinksFilters } from "./backlinks-filters-model";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";

const meta = {
  args: {
    estimateCents: 5,
    onLoadMore: async () => ({
      ...backlinksSnapshotFixture,
      costCents: 1,
      fetchedRowCount: 200,
      rows: [],
    }),
    onRefresh: () => undefined,
    refreshing: false,
    snapshot: backlinksSnapshotFixture,
  },
  component: BacklinksResults,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/Results",
} satisfies Meta<typeof BacklinksResults>;

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date("2026-07-24T12:00:00.000Z");
const activeDrawerFilters = {
  ...emptyBacklinksFilters,
  domainAuthority: [30, 100] as [number, number],
  spamScore: [0, 7] as [number, number],
};

export const FullState: Story = {
  args: {
    tableProps: {
      initialAdvancedFilters: activeDrawerFilters,
      initialExpandedDomains: ["deskreview.io", "toolindex.app"],
      now,
    },
  },
};

export const FiltersDrawerActive: Story = {
  args: {
    tableProps: {
      initialAdvancedFilters: activeDrawerFilters,
      initialDrawerOpen: true,
      now,
    },
  },
};

export const FiltersDrawerEmpty: Story = {
  args: {
    tableProps: {
      initialDrawerOpen: true,
      now,
    },
  },
};

export const ReferringDomains: Story = {
  args: { tableProps: { initialView: "referring_domains", now } },
};

export const TopPages: Story = {
  args: { tableProps: { initialView: "top_pages", now } },
};

export const Anchors: Story = {
  args: { tableProps: { initialView: "anchors", now } },
};

export const BrokenEmpty: Story = {
  args: { tableProps: { initialFilter: "broken", now } },
};
