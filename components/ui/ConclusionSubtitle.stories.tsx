import { ConclusionSubtitle } from "@/components/ui/ConclusionSubtitle";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/ConclusionSubtitle",
  component: ConclusionSubtitle,
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConclusionSubtitle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { text: "Avg position improved 1.8 in the last 30 days, led by 'headless cms'" },
};

export const Loading: Story = { args: { loading: true } };
