import { SchedulePausedBudgetExhausted } from "@/components/keyword-detail/empty/SchedulePausedBudgetExhausted";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: SchedulePausedBudgetExhausted,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Schedule paused and budget exhausted",
} satisfies Meta<typeof SchedulePausedBudgetExhausted>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
