import { KeywordDetailFreeActionButton } from "@/components/keyword-detail/shared/KeywordDetailFreeActionButton";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: KeywordDetailFreeActionButton,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/shared/Free action button",
} satisfies Meta<typeof KeywordDetailFreeActionButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Refresh: Story = {
  args: { children: "Refresh", onClick: () => undefined },
};
