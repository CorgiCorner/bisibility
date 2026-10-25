import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import { storyTimeZone } from "@/.storybook/story-locale";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import type { Meta, StoryObj } from "@storybook/react";
import { CheckRunsSection } from "./CheckRunsSection";
import runsMeta from "./CheckRunsSection.stories";
import { checkRunsFixtureView, completedRunFixture } from "./check-runs-fixtures";
import { RankResultMarker } from "./RankResultMarker";

const evidence: EvidenceProjection = {
  acceptance: "accepted",
  fulfillment: "partial",
  returnedDepth: 20,
  accounting: "unknown",
  result: "partial",
  cost: "unknown",
  recovery: null,
  originalCheckedAt: "2026-10-20T06:00:00Z",
};
const meta = {
  title: "Checks/Evidence/RankResult",
  component: RankResultMarker,
  decorators: [withEvidenceMessages],
  render: (args, context) => (
    <CheckRunsSection
      {...runsMeta.args}
      budget={{ blocked: [], forecast: null }}
      now={new Date("2026-10-24T07:00:00Z")}
      asOfDate="2026-10-24"
      timeZone={storyTimeZone(context.globals.timeZone)}
      initialExpandedRunIds={[completedRunFixture.id]}
      view={{
        ...checkRunsFixtureView,
        rows: [
          {
            ...completedRunFixture,
            position: args.position,
            checkedAt: args.evidence.originalCheckedAt,
            startedAt: args.evidence.originalCheckedAt,
            finishedAt: new Date(
              new Date(args.evidence.originalCheckedAt).getTime() + 10000,
            ).toISOString(),
            status: args.evidence.result === "partial" ? "failed" : "completed",
            previousPosition: null,
            evidenceProjection: args.evidence,
          },
        ],
      }}
    />
  ),
  args: { evidence, position: 7 },
} satisfies Meta<typeof RankResultMarker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Partial: Story = {};
export const PartialNoMatch: Story = { args: { position: null } };
export const Recovered: Story = {
  args: { evidence: { ...evidence, result: "recovered", cost: "measured" } },
};
export const RecoveredUnknownCost: Story = {
  args: { evidence: { ...evidence, result: "recovered" } },
};
