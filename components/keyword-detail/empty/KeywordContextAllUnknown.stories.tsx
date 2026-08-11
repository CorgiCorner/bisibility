import { KeywordContextAllUnknown } from "@/components/keyword-detail/empty/KeywordContextAllUnknown";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: KeywordContextAllUnknown,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Keyword context all unknown",
} satisfies Meta<typeof KeywordContextAllUnknown>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
