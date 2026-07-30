import { SampleProjectBanner } from "@/components/sample-data/SampleProjectBanner";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Overview/SampleProjectBanner",
  component: SampleProjectBanner,
  decorators: [
    (Story) => (
      <div className="min-h-[220px] bg-bg p-6 text-fg">
        <div className="max-w-5xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SampleProjectBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { projectId: "project_sample" },
};
