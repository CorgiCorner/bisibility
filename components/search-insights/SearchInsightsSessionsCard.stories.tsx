import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsSessionsCard } from "./SearchInsightsSessionsCard";

const meta = {
  component: SearchInsightsSessionsCard,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/SessionsCard",
} satisfies Meta<typeof SearchInsightsSessionsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { projectId: "prj_1" } };
