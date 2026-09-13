import { AppHeaderFrame } from "@/components/shell/AppHeaderFrame";
import { AppRealtimeContext } from "@/lib/realtime/useAppRealtime";
import type { Meta, StoryObj } from "@storybook/react";
import { OverviewHeaderContext } from "./OverviewHeaderContext";
import { OverviewToolbar } from "./OverviewToolbar";

const options = [
  { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
  { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
];
const meta = {
  title: "Components/Overview/Header context",
  component: OverviewHeaderContext,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/app/prj_story/dashboard" } },
  },
  args: { options },
  render: (args) => (
    <AppRealtimeContext.Provider value={{ notifications: null, operations: [], status: "live" }}>
      <div className="min-h-[540px] bg-bg text-fg">
        <AppHeaderFrame
          activeProjectId="prj_story"
          projectRef="prj_story"
          workspaces={[]}
          canCreateWorkspace={false}
          notificationControl={null}
          context={<OverviewHeaderContext {...args} />}
        />
        <div className="p-4 sm:p-5 lg:px-7 lg:py-5.5">
          <OverviewToolbar projectRef="prj_story" />
        </div>
      </div>
    </AppRealtimeContext.Provider>
  ),
} satisfies Meta<typeof OverviewHeaderContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AllMarkets: Story = {};
export const FocusedDashboard: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/app/prj_story/dashboard",
        query: { device: "mobile", market: "loc_es_es", range: "7d", tag: "Docs" },
      },
    },
  },
};
