import { OverviewNoData } from "@/components/overview/OverviewNoData";
import { overviewFixture } from "@/components/overview/overview-fixtures";
import type { OverviewView } from "@/components/overview/types";
import type { Meta, StoryObj } from "@storybook/react";

const noDataOverview = {
  ...overviewFixture,
  dataSource: {
    ...overviewFixture.dataSource,
    metrics: overviewFixture.dataSource.metrics.map((metric) =>
      metric.label === "Provider" ? { ...metric, value: "Not connected" } : metric,
    ),
    status: "Provider not connected",
  },
  distribution: overviewFixture.distribution.map((bucket) => ({ ...bucket, count: 0 })),
  firstPendingKeywordId: "kw_newsite_01",
  gettingStarted: { ...overviewFixture.gettingStarted, providerConnected: false },
  hasEverChecked: false,
  highlights: [
    {
      kind: "recentlyAdded",
      rows: [
        "ai visibility tracker",
        "brand monitoring tool",
        "content decay alerts",
        "enterprise seo dashboard",
      ].map((keyword, index) => ({
        id: `kw_newsite_${String(index + 1).padStart(2, "0")}`,
        keyword,
        note: "Added today · first check pending",
        positionText: "No data",
        positionTone: "muted",
      })),
      subtitle: "Waiting for first check",
      title: "Recently added",
    },
  ],
  providerConnected: false,
  lastCheckAt: null,
  lastCheckEverAt: null,
  state: "no-data",
  serpProviderState: "missing",
  trackedKeywordCount: 20,
} satisfies OverviewView;

const readyOverview = {
  ...noDataOverview,
  dataSource: {
    ...noDataOverview.dataSource,
    metrics: noDataOverview.dataSource.metrics.map((metric) =>
      metric.label === "Provider" ? { ...metric, value: "DataForSEO" } : metric,
    ),
    status: "Provider healthy",
  },
  gettingStarted: { ...noDataOverview.gettingStarted, providerConnected: true },
  providerConnected: true,
  serpProviderState: "ready",
} satisfies OverviewView;

const needsAttentionOverview = {
  ...noDataOverview,
  dataSource: { ...noDataOverview.dataSource, status: "Provider needs attention" },
  serpProviderState: "needs_attention",
} satisfies OverviewView;

const runCheckNowAction = async () => ({ status: "running" });
const getFirstCheckRunPlanAction = async () => ({
  budget: { capCents: 5000, spentCents: 1250 },
  budgetExhausted: false,
  estimatedCostPerCheckCents: 0.1,
  isSampleProject: false,
  providerReady: true,
  providers: ["dataforseo", "serpapi"],
  readyCount: 20,
  scope: {
    depth: "Top 100",
    device: "Desktop",
    engine: "Google",
    frequency: "Daily",
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
  title: "Overview/OverviewNoData",
  component: OverviewNoData,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <div className="mx-auto max-w-7xl">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof OverviewNoData>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MissingProvider: Story = {
  args: {
    budgetExhausted: false,
    ...actionArgs,
    overview: noDataOverview,
    runningCheckCount: 0,
  },
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
  args: {
    budgetExhausted: false,
    ...actionArgs,
    overview: readyOverview,
    runningCheckCount: 0,
  },
};

export const FirstCheckRunning: Story = {
  args: {
    budgetExhausted: false,
    ...actionArgs,
    overview: readyOverview,
    runningCheckCount: 1,
  },
};
