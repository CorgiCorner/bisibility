import type { Meta, StoryObj } from "@storybook/react";
import { backlinksSnapshotFixture } from "./backlinks-fixtures";
import { SummaryCards } from "./SummaryCards";

const meta = {
  args: {
    history: backlinksSnapshotFixture.history,
    summary: backlinksSnapshotFixture.summary,
  },
  component: SummaryCards,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Backlinks/Summary cards",
} satisfies Meta<typeof SummaryCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Results: Story = {};
