import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { projectRankTrackerFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import { aggregateMarketGridRows, groupRow } from "@/lib/keywords/market-grid-model";
import type { Meta, StoryObj } from "@storybook/react";
import workspaceMeta, { Flat as FlatWorkspace, GroupedMarkets } from "./KeywordsGrid.stories";

const meta = {
  ...workspaceMeta,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={projectRankTrackerFeatureTestMessages}
        timeZone="UTC"
      >
        <Story />
      </FeatureMessagesProvider>
    ),
    ...workspaceMeta.decorators,
  ],
  title: "Keywords/Column boundaries",
} satisfies Meta<typeof workspaceMeta.component>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flat: Story = FlatWorkspace;
export const Grouped: Story = GroupedMarkets;
export const SingleActiveTarget: Story = {
  ...GroupedMarkets,
  args: {
    ...GroupedMarkets.args,
    matchedGroupCount: 1,
    matchedTargetCount: 1,
    rows: aggregateMarketGridRows([keywordRows[0]]).map((aggregate) =>
      groupRow(aggregate, aggregate.children),
    ),
  },
};
