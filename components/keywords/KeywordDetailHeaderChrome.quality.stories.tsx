import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { projectRankTrackerFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import type { Meta, StoryObj } from "@storybook/react";
import { KeywordDetailHeaderChrome } from "./KeywordDetailHeaderChrome";
import {
  detailMetadataFixture,
  detailQualityFixture,
  unavailableDetailQuality,
} from "./keyword-detail-quality.test-fixture";

const meta = {
  component: KeywordDetailHeaderChrome,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider
        locale="en"
        messages={projectRankTrackerFeatureTestMessages}
        timeZone="UTC"
      >
        <DateDisplayProvider>
          <Story />
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  title: "Keyword detail/Recorded header quality",
  args: {
    actions: null,
    keyword: detailMetadataFixture(),
    quality: detailQualityFixture(),
    timeZone: "UTC",
  },
  parameters: { layout: "padded", chromatic: { viewports: [390, 768, 1280] } },
} satisfies Meta<typeof KeywordDetailHeaderChrome>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentAndAllRetainedBest: Story = {};
export const CurrentUnknownRetainedRank: Story = { args: { quality: unavailableDetailQuality() } };
const failed = detailQualityFixture();
failed.rankQuality.latestAttempt = {
  id: "check_failed",
  status: "failed",
  observedAt: null,
  measurementRecordedAt: "2026-10-12T11:00:00.000Z",
  recordedAt: "2026-10-12T10:59:00.000Z",
};
failed.rankQuality.movement = null;
failed.rankQuality.event = "unknown";
export const LaterFailureKeepsObservedRank: Story = { args: { quality: failed } };
const stale = detailQualityFixture();
if (stale.rankQuality.current)
  stale.rankQuality.current = {
    ...stale.rankQuality.current,
    freshness: "stale",
    freshnessReason: null,
  };
stale.rankQuality.comparison = "unavailable";
stale.rankQuality.movement = null;
stale.rankQuality.event = "unknown";
export const StaleObservation: Story = { args: { quality: stale } };
