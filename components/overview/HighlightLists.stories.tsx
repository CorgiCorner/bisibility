import { HighlightLists } from "@/components/overview/HighlightLists";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  args: { projectRef: "prj_1" },
  title: "Overview/HighlightLists",
  component: HighlightLists,
  decorators: [
    (Story) => (
      <ProjectDashboardMessages>
        <div className="min-h-[520px] bg-bg p-6 text-fg">
          <Story />
        </div>
      </ProjectDashboardMessages>
    ),
  ],
} satisfies Meta<typeof HighlightLists>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { lists: overviewFixture.highlights },
};

export const EmptyLists: Story = {
  args: { lists: overviewFixture.highlights.map((list) => ({ ...list, rows: [] })) },
};
