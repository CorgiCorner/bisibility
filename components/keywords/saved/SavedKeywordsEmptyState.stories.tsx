import type { Meta, StoryObj } from "@storybook/react";
import { SavedKeywordsEmptyState } from "./SavedKeywordsEmptyState";

const meta = {
  component: SavedKeywordsEmptyState,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Keywords/Saved/Empty state",
} satisfies Meta<typeof SavedKeywordsEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { projectRef: "prj_1" } };
