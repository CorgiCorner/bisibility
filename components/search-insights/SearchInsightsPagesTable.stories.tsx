import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { storyPageRows } from "./search-insights-story-fixtures";

const meta = {
  component: SearchInsightsPagesTable,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/PagesTable",
} satisfies Meta<typeof SearchInsightsPagesTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchClicks: Story = { args: { rows: storyPageRows } };

export const WithSessions: Story = {
  args: { rows: [{ ...storyPageRows[0], sessions: 1_200 }], showSessions: true },
};
