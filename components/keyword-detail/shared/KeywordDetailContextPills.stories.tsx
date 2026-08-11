import { KeywordDetailContextPills } from "@/components/keyword-detail/shared/KeywordDetailContextPills";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: KeywordDetailContextPills,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/shared/Context pills",
} satisfies Meta<typeof KeywordDetailContextPills>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { depth: 20, device: "Desktop", location: "United States" },
};
