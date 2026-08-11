import { TargetMismatchCannibalization } from "@/components/keyword-detail/empty/TargetMismatchCannibalization";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: TargetMismatchCannibalization,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/empty/Target mismatch cannibalization",
} satisfies Meta<typeof TargetMismatchCannibalization>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
