import type { Meta, StoryObj } from "@storybook/react";
import { TimelineFeed } from "./TimelineFeed";

const meta = {
  args: {
    canCreate: true,
    canDelete: true,
    projectId: "project_story",
    projectRef: "prj_story",
    view: {
      filter: "all",
      hasNextPage: false,
      hasPreviousPage: false,
      isFiltered: false,
      now: new Date("2026-08-14T09:00:00.000Z"),
      page: 1,
      rows: [],
      search: "",
      timeZone: "Europe/Warsaw",
    },
  },
  component: TimelineFeed,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Timeline/Feed",
} satisfies Meta<typeof TimelineFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
