import { CheckStatusChip } from "@/components/ui/CheckStatusChip";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/CheckStatusChip",
  component: CheckStatusChip,
  decorators: [
    (Story) => (
      <div className="min-h-[160px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CheckStatusChip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { kind: "running" },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <CheckStatusChip kind="running" />
      <CheckStatusChip kind="failed" />
      <CheckStatusChip kind="pending" />
      <CheckStatusChip kind="completed" />
    </div>
  ),
};
