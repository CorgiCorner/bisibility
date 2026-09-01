import { KNOWN_DATA_INCIDENTS } from "@/lib/search-insights/constants";
import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsTrustStrip } from "./SearchInsightsTrustStrip";
import {
  storyCoverage,
  storyImportFacts,
  storyImportState,
} from "./search-insights-story-fixtures";

const meta = {
  component: SearchInsightsTrustStrip,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
          <Story />
        </div>
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/TrustStrip",
} satisfies Meta<typeof SearchInsightsTrustStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

const pauseAction = async () => ({ ok: true as const, state: "running" });

const common = {
  coverage: storyCoverage,
  deploymentMode: "self-host" as const,
  providerAvailabilitySource: "metadata" as const,
  providerAvailableThrough: "2026-07-08",
  importState: storyImportState,
  incidents: [],
  localViewReady: true,
  pauseAction,
  projectId: "prj_story",
  statusFacts: {
    connectionStatus: "connected" as const,
    observability: storyImportFacts,
    runtime: {
      workerStatus: {
        status: "ok" as const,
        temporalIdentityComparison: { detail: "identities match", status: "match" as const },
      },
      workflowStatus: "running" as const,
    },
    state: "running" as const,
  },
  workerStatus: {
    status: "ok" as const,
    temporalIdentityComparison: { detail: "identities match", status: "match" as const },
  },
};

export const ImportRunning: Story = { args: common };

export const Cloud: Story = { args: { ...common, deploymentMode: "cloud" } };

export const ImportPaused: Story = {
  args: { ...common, importState: { ...storyImportState, state: "paused" } },
};

export const ImportDone: Story = {
  args: { ...common, importState: { ...storyImportState, state: "completed" } },
};

export const CeilingAndIncident: Story = {
  args: {
    ...common,
    coverage: { ...storyCoverage, capHitDays: 3 },
    incidents: KNOWN_DATA_INCIDENTS,
  },
};

export const StartupStarting: Story = {
  args: { ...common, providerAvailableThrough: null, importState: null },
};

export const StartupPlanned: Story = {
  args: {
    ...common,
    providerAvailableThrough: null,
    importState: {
      ...storyImportState,
      facts: {
        ...storyImportFacts,
        consecutiveDays: 0,
        lastActivityAt: null,
        qualifyingDays: 0,
      },
    },
  },
};

export const StartupActive: Story = {
  args: { ...common, providerAvailableThrough: null },
};

export const PartialBackfill: Story = {
  args: {
    ...common,
    coverage: { calculable: false, capHitDays: 0, clicksShare: 0, impressionsShare: 0 },
    importState: {
      ...storyImportState,
      facts: { ...storyImportFacts, consecutiveDays: 5, qualifyingDays: 5 },
    },
    localViewReady: false,
  },
};

export const First28Ready: Story = { args: common };

export const CalculableZeroCoverage: Story = {
  args: {
    ...common,
    coverage: { calculable: true, capHitDays: 0, clicksShare: 0, impressionsShare: 0 },
  },
};
