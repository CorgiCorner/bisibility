import { SummaryStrip } from "@/components/ui/SummaryStrip";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "UI/SummaryStrip",
  component: SummaryStrip,
  decorators: [
    (Story) => (
      <div className="max-w-4xl bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SummaryStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Improved: Story = {
  args: {
    sentence: "12 of 48 keywords improved this week · biggest drop: react data grid (-2)",
    tone: "improved",
  },
};

export const Dropped: Story = {
  args: {
    sentence: "No keywords improved this week · biggest drop: react data grid (-2)",
    tone: "dropped",
  },
};

export const Steady: Story = {
  args: { sentence: "Positions held steady this week", tone: "steady" },
};

export const Loading: Story = { args: { loading: true } };
