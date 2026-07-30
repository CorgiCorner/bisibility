import type { Meta, StoryObj } from "@storybook/react";
import { CloudBetaBanner } from "./CloudBetaBanner";

const meta = {
  title: "Shell/CloudBetaBanner",
  component: CloudBetaBanner,
  args: {
    dismissed: false,
    isCloud: true,
    lastExport: { exportedAt: "2026-07-19T12:00:00.000Z" },
    now: "2026-07-25T12:00:00.000Z",
    projectId: "project_1",
    projectRef: "prj_1",
    projectName: "acme.dev",
  },
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div className="min-h-[220px] bg-bg text-fg">
      <CloudBetaBanner {...args} />
    </div>
  ),
} satisfies Meta<typeof CloudBetaBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
