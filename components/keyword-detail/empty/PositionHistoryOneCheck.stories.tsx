import { PositionHistoryOneCheck } from "@/components/keyword-detail/empty/PositionHistoryOneCheck";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: PositionHistoryOneCheck,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Position history one check",
} satisfies Meta<typeof PositionHistoryOneCheck>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
