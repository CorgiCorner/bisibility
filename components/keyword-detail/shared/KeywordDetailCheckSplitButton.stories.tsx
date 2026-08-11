import {
  type KeywordDetailCheckDepthOption,
  KeywordDetailCheckSplitButton,
} from "@/components/keyword-detail/shared/KeywordDetailCheckSplitButton";
import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

const options = [
  { label: "Top 10", price: "Provider estimate", value: "10" },
  { label: "Top 20", price: "Provider estimate", value: "20" },
  { label: "Top 50", price: "Provider estimate", value: "50" },
  { label: "Top 100", price: "Provider estimate", value: "100" },
] satisfies readonly KeywordDetailCheckDepthOption[];

function SplitButtonStory() {
  const [depth, setDepth] = useState("20");

  return (
    <KeywordDetailCheckSplitButton
      actionLabel="Run check"
      onAction={() => undefined}
      onDepthChange={setDepth}
      options={options}
      selectedValue={depth}
      trackingDepthLabel="Top 20"
    />
  );
}

const meta = {
  component: KeywordDetailCheckSplitButton,
  decorators: [
    (Story) => (
      <KeywordDetailStoryThemes>
        <Story />
      </KeywordDetailStoryThemes>
    ),
  ],
  title: "Keyword detail/shared/Check split button",
} satisfies Meta<typeof KeywordDetailCheckSplitButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    actionLabel: "Run check",
    onAction: () => undefined,
    onDepthChange: () => undefined,
    options,
    selectedValue: "20",
    trackingDepthLabel: "Top 20",
  },
  render: SplitButtonStory,
};
