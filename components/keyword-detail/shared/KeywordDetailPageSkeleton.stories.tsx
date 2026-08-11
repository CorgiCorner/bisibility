import { KeywordDetailPageSkeleton } from "@/components/keyword-detail/shared/KeywordDetailPageSkeleton";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: KeywordDetailPageSkeleton,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/shared/Page skeleton",
} satisfies Meta<typeof KeywordDetailPageSkeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-[1180px]">
        <Story />
      </div>
    ),
  ],
};
