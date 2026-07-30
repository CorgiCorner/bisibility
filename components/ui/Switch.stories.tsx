import { Switch } from "@/components/ui/Switch";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/Switch",
  component: Switch,
  decorators: [
    (Story) => (
      <div className="flex flex-wrap gap-3 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <>
      <Switch defaultChecked label="Paused" name="isPaused" />
      <Switch description="Queue checks when provider budget allows." label="Scheduled checks" />
      <Switch disabled label="Locked" />
    </>
  ),
};
