import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import { storyTimeZone } from "@/.storybook/story-locale";
import type { Meta, StoryObj } from "@storybook/react";
import { checkRunsFixtureView } from "./check-runs-fixtures";
import { EvidenceRunsWorkspace } from "./EvidenceRunsWorkspace";

const meta = {
  title: "Checks/Evidence/Runs",
  component: EvidenceRunsWorkspace,
  decorators: [withEvidenceMessages],
  parameters: { nextjs: { appDirectory: true } },
  render: (args, context) => (
    <EvidenceRunsWorkspace {...args} timeZone={storyTimeZone(context.globals.timeZone)} />
  ),
  args: {
    projectRef: "prj_story",
    now: "2026-10-23T07:00:00Z",
    timeZone: "Europe/Warsaw",
    query: { range: "7d", trigger: "programmatic", status: "all" },
    view: {
      ...checkRunsFixtureView,
      evidenceCounts: {
        under_review: 2,
        recovered: 3,
        partial: 1,
        provider_error: 1,
        missing: 0,
        cost_conflict: 1,
      },
    },
  },
} satisfies Meta<typeof EvidenceRunsWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Programmatic: Story = {};
export const DeferredWithEvidence: Story = {
  args: { query: { range: "7d", trigger: "all", status: "deferred" } },
};
export const OtherReason: Story = {
  args: {
    query: { range: "7d", trigger: "all", status: "deferred" },
    view: {
      ...checkRunsFixtureView,
      deferredGroups: [
        {
          reason: "other",
          rawReason: "future_provider_reason",
          count: 3,
          keywordCount: 2,
          firstAt: "2026-10-23T06:00:00Z",
          lastAt: "2026-10-23T07:00:00Z",
        },
      ],
    },
  },
};
export const InvalidRange: Story = {
  args: { query: { range: "7d", trigger: "all", status: "all", from: "bad", to: "bad" } },
};
