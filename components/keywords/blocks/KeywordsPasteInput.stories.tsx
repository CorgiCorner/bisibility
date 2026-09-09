import type { Meta, StoryObj } from "@storybook/react";
import { KeywordsPasteInput } from "./KeywordsPasteInput";

const meta = {
  component: KeywordsPasteInput,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  title: "Keywords/Blocks/KeywordsPasteInput",
} satisfies Meta<typeof KeywordsPasteInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const base = { count: () => {}, onChange: () => {} };

export const Empty: Story = { args: { ...base, value: "" } };
export const Valid: Story = {
  args: { ...base, value: "rank tracking | https://example.com/rank\nseo tools" },
};
export const ErrorState: Story = {
  args: { ...base, value: "rank tracking | not a url\nRANK TRACKING" },
};
