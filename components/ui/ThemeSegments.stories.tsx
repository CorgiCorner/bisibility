import { ThemeSegments, ThemeSegmentsRow } from "@/components/ui/ThemeSegments";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/ThemeSegments",
  component: ThemeSegments,
  decorators: [
    (Story) => (
      <div className="flex flex-col items-start gap-4 bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThemeSegments>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Sizes: Story = {
  render: () => (
    <>
      <ThemeSegments size="sm" />
      <ThemeSegments size="md" />
    </>
  ),
};

export const MenuRow: Story = {
  render: () => (
    <div className="w-[248px] rounded-[13px] border border-border bg-bg-elev p-1.5">
      <ThemeSegmentsRow />
    </div>
  ),
};
