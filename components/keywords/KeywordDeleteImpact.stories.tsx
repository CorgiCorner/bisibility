import { ProjectRankTrackerMessages } from "@/components/rank-tracker/ProjectRankTrackerMessages";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ToastProvider } from "@/components/ui/Toast";
import type { Meta, StoryObj } from "@storybook/react";
import { KeywordDeleteImpact } from "./KeywordDeleteImpact";

const meta = {
  title: "Keywords/Delete impact",
  component: KeywordDeleteImpact,
  args: {
    projectId: "prj_example",
    impact: {
      keywordCount: 2,
      targetCount: 3,
      runningTargetCount: 0,
      schedules: [
        {
          publicId: "sch_daily",
          name: "Daily brand keywords",
          removedTargets: 2,
          remainingTargets: 14,
        },
        {
          publicId: "sch_weekly",
          name: "Weekly discovery",
          removedTargets: 1,
          remainingTargets: 0,
        },
      ],
    },
  },
  decorators: [
    (Story) => (
      <ProjectRankTrackerMessages>
        <ToastProvider>
          <ConfirmModal
            size="lg"
            kind="deleteBulk"
            open
            onClose={() => undefined}
            onConfirm={() => undefined}
          >
            <Story />
          </ConfirmModal>
        </ToastProvider>
      </ProjectRankTrackerMessages>
    ),
  ],
} satisfies Meta<typeof KeywordDeleteImpact>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {};
export const Manual: Story = {
  args: { impact: { keywordCount: 1, targetCount: 1, runningTargetCount: 0, schedules: [] } },
};
