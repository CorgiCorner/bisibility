import AlertsLoading from "@/app/(regional)/app/(workspace)/[project]/alerts/loading";
import { ScheduleEditorLoadingContent } from "@/components/schedules/ScheduleEditorLoadingContent";
import { PageContent } from "@/components/shell/PageContent";
import type { Meta, StoryObj } from "@storybook/react";
import { ProjectRunsLoading } from "./ProjectRunsLoading";

const meta = {
  component: ProjectRunsLoading,
  parameters: { layout: "fullscreen" },
  title: "Runs/Loading",
  decorators: [
    (Story) => (
      <div className="p-4 sm:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProjectRunsLoading>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Runs: Story = { args: { active: "runs" } };
export const Schedules: Story = { args: { active: "schedules" } };

export const ScheduleEditor: Story = {
  render: () => (
    <PageContent>
      <ScheduleEditorLoadingContent />
    </PageContent>
  ),
};
export const Alerts: Story = { render: () => <AlertsLoading /> };
