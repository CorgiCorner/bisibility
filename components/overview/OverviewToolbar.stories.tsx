import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import messages from "@/messages/core/en/project-dashboard.json";
import type { Meta, StoryObj } from "@storybook/react";
import { OverviewToolbar } from "./OverviewToolbar";

const meta = {
  args: {
    initialSelected: {
      availableTags: ["Docs", "Product"],
      deviceValue: "all",
      marketOptions: [
        { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
        { label: "Spain", secondary: "English", value: "loc_es_en" },
        { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
      ],
      marketValues: [],
      rangeValue: "28d",
      tagValue: null,
    },
    projectRef: "prj_story",
  },
  component: OverviewToolbar,
  decorators: [
    (Story) => (
      <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
        <div className="min-h-[180px] bg-bg px-7 pt-5.5">
          <Story />
        </div>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: { nextjs: { appDirectory: true } },
  title: "Overview/Toolbar",
} satisfies Meta<typeof OverviewToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
