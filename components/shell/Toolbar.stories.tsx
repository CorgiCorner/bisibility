import { Toolbar } from "@/components/shell/Toolbar";
import { Button, Pill } from "@/components/ui";
import {
  CalendarBlankIcon as CalendarBlank,
  MonitorIcon as Monitor,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Shell/Toolbar",
  component: Toolbar,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Toolbar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Filters: Story = {
  args: {
    action: (
      <Button startIcon={<Plus size={15} />} variant="primary">
        Add keyword
      </Button>
    ),
    children: (
      <>
        <Pill>
          <CalendarBlank size={15} /> Last 28 days
        </Pill>
        <Pill>
          <Monitor size={15} /> Desktop
        </Pill>
      </>
    ),
  },
  render: (args) => (
    <div className="min-h-[140px] bg-bg text-fg">
      <Toolbar {...args} />
    </div>
  ),
};
