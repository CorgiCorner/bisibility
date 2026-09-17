import { OverviewNoData } from "@/components/overview/OverviewNoData";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import { ProjectDashboardMessages } from "@/components/overview/ProjectDashboardMessages";
import type { OverviewView } from "@/components/overview/types";
import type { FirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import type { Meta, StoryObj } from "@storybook/react";

const noDataOverview = {
  ...overviewFixture,
  dataSource: {
    ...overviewFixture.dataSource,
    lastCheckAt: null,
    lastCheckProvider: null,
    nextCheckAt: null,
    primaryProvider: null,
    status: "notConnected",
  },
  distribution: overviewFixture.distribution.map((bucket) => ({ ...bucket, count: 0 })),
  firstPendingKeywordId: "kw_newsite_01",
  gettingStarted: { ...overviewFixture.gettingStarted, hasCheck: false, providerConnected: false },
  hasEverChecked: false,
  highlights: [
    {
      kind: "recentlyAdded",
      rows: ["ai visibility tracker", "brand monitoring tool", "content decay alerts"].map(
        (keyword, index) => ({
          id: `kw_newsite_${String(index + 1).padStart(2, "0")}`,
          keyword,
          note: {
            age: { kind: "justNow" as const },
            checkState: "firstCheckPending" as const,
            kind: "recentlyAdded" as const,
            url: null,
          },
          position: null,
          positionState: "awaitingFirstCheck" as const,
          positionTone: "muted" as const,
        }),
      ),
    },
  ],
  lastCheckAt: null,
  lastCheckEverAt: null,
  providerConnected: false,
  serpProviderState: "missing",
  state: "no-data",
  trackedKeywordCount: 20,
} satisfies OverviewView;

const readyOverview = {
  ...noDataOverview,
  dataSource: { ...noDataOverview.dataSource, primaryProvider: "dataforseo", status: "healthy" },
  gettingStarted: { ...noDataOverview.gettingStarted, providerConnected: true },
  providerConnected: true,
  serpProviderState: "ready",
} satisfies OverviewView;

const needsAttentionOverview = {
  ...noDataOverview,
  dataSource: { ...noDataOverview.dataSource, status: "needsAttention" },
  serpProviderState: "needs_attention",
} satisfies OverviewView;

const runCheckNowAction = async () => ({ status: "running" });
const getFirstCheckRunPlanAction = async (): Promise<FirstCheckRunPlan> => ({
  budget: { capCents: 5000, spentCents: 1250 },
  budgetExhausted: false,
  estimatedCostPerCheckCents: 0.1,
  isSampleProject: false,
  providerReady: true,
  providers: ["dataforseo", "serpapi"],
  readyCount: 20,
  scope: {
    depth: 100,
    device: "desktop",
    engine: "google",
    frequency: "daily",
    location: "United States",
  },
});
const queueFirstChecksAction = async () => ({ queued: 19 });

const actionArgs = {
  getFirstCheckRunPlanAction,
  projectId: "prj_7Kd2Qf9m",
  projectRef: "prj_7Kd2Qf9m",
  queueFirstChecksAction,
  runCheckNowAction,
};

const meta = {
  component: OverviewNoData,
  decorators: [
    (Story) => (
      <ProjectDashboardMessages>
        <div className="min-h-screen bg-bg p-6 text-fg">
          <div className="mx-auto max-w-7xl">
            <Story />
          </div>
        </div>
      </ProjectDashboardMessages>
    ),
  ],
  title: "Overview/OverviewNoData",
} satisfies Meta<typeof OverviewNoData>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MissingProvider: Story = {
  args: { budgetExhausted: false, ...actionArgs, overview: noDataOverview, runningCheckCount: 0 },
};

export const ProviderNeedsAttention: Story = {
  args: {
    budgetExhausted: false,
    ...actionArgs,
    overview: needsAttentionOverview,
    runningCheckCount: 0,
  },
};

export const ReadyForFirstCheck: Story = {
  args: { budgetExhausted: false, ...actionArgs, overview: readyOverview, runningCheckCount: 0 },
};

export const FirstCheckRunning: Story = {
  args: { budgetExhausted: false, ...actionArgs, overview: readyOverview, runningCheckCount: 1 },
};
