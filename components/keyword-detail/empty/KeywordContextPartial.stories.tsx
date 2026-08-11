import { KeywordContextPartial } from "@/components/keyword-detail/empty/KeywordContextPartial";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: KeywordContextPartial,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Keyword context partial",
} satisfies Meta<typeof KeywordContextPartial>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
