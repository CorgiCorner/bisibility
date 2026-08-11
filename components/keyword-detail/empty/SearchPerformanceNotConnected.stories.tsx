import { SearchPerformanceNotConnected } from "@/components/keyword-detail/empty/SearchPerformanceNotConnected";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: SearchPerformanceNotConnected,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Search performance not connected",
} satisfies Meta<typeof SearchPerformanceNotConnected>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
