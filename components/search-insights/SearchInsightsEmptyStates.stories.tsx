import type { Meta, StoryObj } from "@storybook/react";
import {
  SearchInsightsNoDataState,
  SearchInsightsNoPropertyState,
} from "./SearchInsightsEmptyStates";

const meta = {
  component: SearchInsightsNoPropertyState,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/EmptyStates",
} satisfies Meta<typeof SearchInsightsNoPropertyState>;

export default meta;
type Story = StoryObj<typeof meta>;

const action = async () => ({ ok: true as const, state: "running" });
const processProps = {
  pauseAction: action,
  projectId: "prj_story",
  resumeAction: action,
  retryAction: action,
};

export const NoProperty: Story = { args: { projectId: "prj_story" } };

export const NeedsReconnect: Story = { args: { projectId: "prj_story", reauth: true } };

export const Startup: Story = {
  args: { projectId: "prj_story" },
  render: () => (
    <SearchInsightsNoDataState
      {...processProps}
      facts={{
        completedDays: 0,
        connectionStatus: "connected",
        deploymentMode: "self-host",
        firstViewReady: false,
        state: "created",
        workerStatus: "ok",
      }}
    />
  ),
};

export const PartialBackfill: Story = {
  args: { projectId: "prj_story" },
  render: () => (
    <SearchInsightsNoDataState
      {...processProps}
      facts={{
        completedDays: 7,
        connectionStatus: "connected",
        deploymentMode: "self-host",
        firstViewReady: false,
        state: "running",
        workerStatus: "ok",
      }}
    />
  ),
};
