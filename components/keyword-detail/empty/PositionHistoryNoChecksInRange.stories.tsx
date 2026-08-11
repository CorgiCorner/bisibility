import { PositionHistoryNoChecksInRange } from "@/components/keyword-detail/empty/PositionHistoryNoChecksInRange";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: PositionHistoryNoChecksInRange,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Position history no checks in range",
} satisfies Meta<typeof PositionHistoryNoChecksInRange>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
