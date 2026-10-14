import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { projectRankTrackerFeatureTestMessages } from "@/i18n/test-support/feature-test-messages";
import { presentReportSummary } from "@/lib/rank-reports/presentation";
import type { Meta, StoryObj } from "@storybook/react";
import workspaceMeta, { Flat as FlatWorkspace } from "./KeywordsGrid.stories";
import {
  currentScopeUnavailableRow,
  rankPoint,
  rankQualityGroup,
  rankQualityRow,
  wholeScopeReport,
} from "./keyword-rank-quality.test-fixture";

const meta = {
  ...workspaceMeta,
  title: "Keywords/Whole scope and quality",
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
} satisfies Meta<typeof workspaceMeta.component>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WholeFilteredScope: Story = {
  ...FlatWorkspace,
  args: {
    ...FlatWorkspace.args,
    matchedTargetCount: 10,
    pageCount: 2,
    report: presentReportSummary(wholeScopeReport()),
    rows: [rankQualityRow(), currentScopeUnavailableRow()],
  },
};

export const CurrentUnknownRetainedPositive: Story = {
  ...WholeFilteredScope,
  args: { ...WholeFilteredScope.args, rows: [currentScopeUnavailableRow()] },
};

const stale = rankQualityRow("kw_stale");
stale.rankQuality.current = rankPoint({ freshness: "stale", freshnessReason: null });
const absent = rankQualityRow("kw_absent");
absent.position = 101;
absent.hasRankData = false;
absent.rankQuality = {
  ...absent.rankQuality,
  current: rankPoint({ evidence: "known_absent", position: null, reportedPosition: null }),
  baseline: rankPoint(),
  movement: null,
  event: "exited",
};
export const StaleUnknownAndConfirmedAbsence: Story = {
  ...WholeFilteredScope,
  args: { ...WholeFilteredScope.args, rows: [stale, currentScopeUnavailableRow(), absent] },
};

export const GroupQualityIndependentOfFirstChild: Story = {
  ...WholeFilteredScope,
  args: {
    ...WholeFilteredScope.args,
    matchedGroupCount: 1,
    query: { ...FlatWorkspace.args!.query!, grouped: true },
    rows: [rankQualityGroup()],
  },
};

export const LegacyWithoutCurrentProof: Story = {
  ...FlatWorkspace,
  args: { ...FlatWorkspace.args, report: undefined },
};
