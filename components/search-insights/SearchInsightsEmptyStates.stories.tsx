import type { Meta, StoryObj } from "@storybook/react";
import {
  SearchInsightsNoDataState,
  SearchInsightsNoPropertyState,
} from "./SearchInsightsEmptyStates";
import { storyImportFacts } from "./search-insights-story-fixtures";

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
const runtime = {
  workerStatus: {
    status: "ok" as const,
    temporalIdentityComparison: { detail: "identities match", status: "match" as const },
  },
};
const startupFacts = {
  ...storyImportFacts,
  consecutiveDays: 0,
  qualifyingDays: 0,
  readyThrough: {
    d1: { current: false, previous: false },
    d7: { current: false, previous: false },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
};

export const NoProperty: Story = { args: { projectId: "prj_story" } };

export const NeedsReconnect: Story = { args: { projectId: "prj_story", reauth: true } };

export const Startup: Story = {
  args: { projectId: "prj_story" },
  render: () => (
    <SearchInsightsNoDataState
      {...processProps}
      facts={{
        connectionStatus: "connected",
        observability: startupFacts,
        runtime,
        state: "created",
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
        connectionStatus: "connected",
        observability: storyImportFacts,
        runtime,
        state: "running",
      }}
    />
  ),
};
