import type { Meta, StoryObj } from "@storybook/react";
import { OverviewToolbar } from "./OverviewToolbar";

const meta = {
  args: {
    initialSelected: {
      availableTags: ["Docs", "Product"],
      device: "All devices",
      deviceValue: "all",
      marketOptions: [
        { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
        { label: "Spain", secondary: "English", value: "loc_es_en" },
        { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
      ],
      marketValues: [],
      range: "Last 28 days",
      rangeValue: "28d",
      tag: "All tags",
      tagValue: null,
    },
    projectRef: "prj_story",
  },
  component: OverviewToolbar,
  decorators: [
    (Story) => (
      <div className="min-h-[180px] bg-bg px-7 pt-5.5">
        <Story />
      </div>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Overview/Toolbar",
} satisfies Meta<typeof OverviewToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
