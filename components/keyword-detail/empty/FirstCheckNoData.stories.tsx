import { FirstCheckNoData } from "@/components/keyword-detail/empty/FirstCheckNoData";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: FirstCheckNoData,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/First check no data",
} satisfies Meta<typeof FirstCheckNoData>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
