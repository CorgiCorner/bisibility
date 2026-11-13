import { StatTile } from "@/components/ui/StatTile";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/StatTile",
  component: StatTile,
  decorators: [
    (Story) => (
      <div className="max-w-xs bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatTile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Regular: Story = {
  args: {
    caption: "from 1,240",
    delta: { direction: "up", label: "+12.4%" },
    label: "Clicks",
    source: "GSC",
    value: "1,394",
  },
};

export const Compact: Story = {
  args: {
    caption: "4 pages",
    density: "compact",
    label: "Existing pages",
    value: "24",
  },
};

export const NoData: Story = {
  args: {
    caption: "Nothing recorded for this month.",
    empty: true,
    label: "Custom",
    value: "No data",
  },
};
