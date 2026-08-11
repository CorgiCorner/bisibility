import {
  KeywordDetailStatePill,
  keywordDetailPageStates,
} from "@/components/keyword-detail/shared/KeywordDetailStatePill";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  component: KeywordDetailStatePill,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/shared/State pill",
} satisfies Meta<typeof KeywordDetailStatePill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllStates: Story = {
  args: { state: "ranked" },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {keywordDetailPageStates.map((state) => (
        <KeywordDetailStatePill key={state} state={state} />
      ))}
    </div>
  ),
};
