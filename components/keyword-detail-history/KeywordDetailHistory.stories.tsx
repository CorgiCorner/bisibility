import { DateDisplayProvider, DateFormatProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { KeywordDetailHeaderChrome } from "@/components/keywords/KeywordDetailHeaderChrome";
import {
  detailMetadataFixture,
  detailQualityFixture,
} from "@/components/keywords/keyword-detail-quality.test-fixture";
import { projectRankTrackerFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import {
  fixtureHistoryPort,
  historyPages,
  observation,
  pagedHistory,
} from "./history.test-fixture";
import { KeywordDetailHistory } from "./KeywordDetailHistory";

const meta = {
  title: "Keywords/Recorded full history",
  component: KeywordDetailHistory,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={projectRankTrackerFeatureTestMessages}
        timeZone="UTC"
      >
        <DateFormatProvider value="month_first">
          <DateDisplayProvider>
            <div className="min-w-0 bg-bg p-6 text-fg">
              <Story />
            </div>
          </DateDisplayProvider>
        </DateFormatProvider>
      </FeatureMessagesProvider>
    ),
  ],
} satisfies Meta<typeof KeywordDetailHistory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SavedWindow: Story = {
  args: { history: fixtureHistoryPort(), keyword: "Stored target", timeZone: "UTC" },
};

export const EmptyWindow: Story = {
  args: { history: fixtureHistoryPort(historyPages(0)), keyword: "Stored target", timeZone: "UTC" },
};

export const AlignedDetailCards: Story = {
  args: { history: fixtureHistoryPort(historyPages(0)), keyword: "Stored target", timeZone: "UTC" },
  render: (args) => (
    <div className="flex min-w-0 flex-col gap-4">
      <KeywordDetailHeaderChrome
        actions={null}
        keyword={detailMetadataFixture()}
        quality={detailQualityFixture()}
        timeZone={args.timeZone}
      />
      <KeywordDetailHistory {...args} />
    </div>
  ),
};

const boundaries = historyPages();
boundaries.observations.records = [
  observation(2, { comparisonDigest: "scope-v2" }),
  observation(1, { evidence: "unknown", position: null, reportedPosition: 101 }),
  observation(0),
];
export const UnknownAndScopeBoundary: Story = {
  args: {
    history: fixtureHistoryPort(boundaries),
    keyword: "Changed search definition",
    timeZone: "Europe/Warsaw",
  },
};

const large = pagedHistory();
const paging = fixtureHistoryPort(large.first);
paging.readPage = async ({ stream }) => ({ ok: true, value: large.rest[stream] });
export const MoreThan240: Story = {
  args: { history: paging, keyword: "320 retained observations and attempts", timeZone: "UTC" },
};

const conflict = fixtureHistoryPort(large.first);
conflict.readPage = async () => ({ ok: false, reason: "snapshot_conflict" });
export const SnapshotChanged: Story = {
  args: { history: conflict, keyword: "Stored target", timeZone: "UTC" },
};
