import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Keywords/RankingUrlHistory",
  component: RankingUrlHistory,
  decorators: [
    (Story) => (
      <div className="min-h-[320px] bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RankingUrlHistory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { keyword: keywordRows[1] },
};
