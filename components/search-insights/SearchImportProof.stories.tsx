import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { searchInsightsKpis } from "@/lib/search-insights/queries/kpis-model";
import type { SearchBackfillFacts } from "@/lib/search-insights/sync/control-model";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { userEvent, within } from "storybook/test";
import { SearchInsightsNoDataState } from "./SearchInsightsEmptyStates";
import { SearchInsightsKpiRow } from "./SearchInsightsKpiRow";
import { SearchInsightsPeriodMenu } from "./SearchInsightsPeriodMenu";
import { SearchInsightsTrustStrip } from "./SearchInsightsTrustStrip";
import {
  storyCoverage,
  storyImportFacts,
  storyImportState,
} from "./search-insights-story-fixtures";

function ProofCanvas({ children }: Readonly<{ children?: ReactNode }>) {
  return <div className="min-h-screen bg-bg p-6 text-fg">{children}</div>;
}

const meta = {
  component: ProofCanvas,
  decorators: [(Story) => <Story />],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Search Console/Import proof",
} satisfies Meta<typeof ProofCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

const action = async () => ({ ok: true as const, state: "running" });
const matchedWorker = {
  status: "ok" as const,
  temporalIdentityComparison: { detail: "identities match", status: "match" as const },
};
const runtime = { workerStatus: matchedWorker, workflowStatus: "running" as const };

function factsForDays(days: number): ImportObservabilityFacts {
  return {
    ...storyImportFacts,
    consecutiveDays: days,
    qualifyingDays: days,
    readyThrough: {
      d7: { current: days >= 7, previous: days >= 14 },
      d28: { current: days >= 28, previous: days >= 56 },
      d90: { current: days >= 90, previous: days >= 180 },
    },
    stall: {
      ...storyImportFacts.stall,
      nextRequestInMs: 12 * 60_000,
      silenceMs: 12 * 60_000,
    },
  };
}

const fiveDayFacts = factsForDays(5);
const sevenDayFacts = factsForDays(7);
const sevenDayImport = { ...storyImportState, facts: sevenDayFacts };

function EmptyBackfill({ facts }: Readonly<{ facts: SearchBackfillFacts }>) {
  return (
    <SearchInsightsNoDataState
      facts={facts}
      pauseAction={action}
      projectId="prj_story"
      resumeAction={action}
      retryAction={action}
    />
  );
}

export const CounterParity: Story = {
  render: () => (
    <ProofCanvas>
      <div className="flex flex-col gap-6">
        <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
          <SearchInsightsTrustStrip
            coverage={storyCoverage}
            deploymentMode="self-host"
            importState={{ ...storyImportState, facts: fiveDayFacts }}
            incidents={[]}
            localViewReady={false}
            providerAvailabilitySource="metadata"
            providerAvailableThrough="2026-07-08"
            workerStatus={matchedWorker}
          />
        </div>
        <div className="rounded-card border border-border bg-bg-elev p-5">
          <EmptyBackfill
            facts={{
              connectionStatus: "connected",
              observability: fiveDayFacts,
              runtime,
              state: "running",
            }}
          />
        </div>
      </div>
    </ProofCanvas>
  ),
};

const totals = {
  current: { clicks: 12480, ctr: 0.0257, impressions: 486310, position: 18.4 },
  previous: { clicks: 11534, ctr: 0.0244, impressions: 471690, position: 20 },
};

export const SevenDayReveal: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Comparison window" }));
  },
  render: () => (
    <ProofCanvas>
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <SearchInsightsPeriodMenu
            importFacts={sevenDayFacts}
            period={{ days: 7, id: "7", label: "7 finalized days", sub: "vs previous 7" }}
            yoy={{ monthsImported: 0, required: 13 }}
          />
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
          <SearchInsightsTrustStrip
            coverage={storyCoverage}
            deploymentMode="self-host"
            importState={sevenDayImport}
            incidents={[]}
            localViewReady
            pauseAction={action}
            projectId="prj_story"
            providerAvailabilitySource="metadata"
            providerAvailableThrough="2026-07-08"
            statusFacts={{
              connectionStatus: "connected",
              observability: sevenDayFacts,
              runtime,
              state: "running",
            }}
            workerStatus={matchedWorker}
          />
        </div>
        <SearchInsightsKpiRow kpis={searchInsightsKpis(totals, false)} />
      </div>
    </ProofCanvas>
  ),
};

export const BaselineSuppressed: Story = {
  render: () => (
    <ProofCanvas>
      <div className="flex flex-col gap-3">
        <p className="m-0 font-sans tabular-nums text-ui-caption text-fg-muted">
          Previous 7-day window is not fully imported
        </p>
        <SearchInsightsKpiRow kpis={searchInsightsKpis(totals, false)} />
      </div>
    </ProofCanvas>
  ),
};

export const StalledWorker: Story = {
  render: () => (
    <ProofCanvas>
      <EmptyBackfill
        facts={{
          connectionStatus: "connected",
          observability: {
            ...sevenDayFacts,
            stall: {
              ...sevenDayFacts.stall,
              silenceMs: 2 * 60 * 60_000,
              thresholdMs: 45 * 60_000,
            },
          },
          runtime,
          state: "running",
        }}
      />
    </ProofCanvas>
  ),
};

const queued = (overrides: Partial<SearchBackfillFacts>): SearchBackfillFacts => ({
  connectionStatus: "connected",
  observability: fiveDayFacts,
  runtime,
  state: "queued",
  ...overrides,
});

export const QueueReasons: Story = {
  render: () => (
    <ProofCanvas>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-border bg-bg-elev p-4">
          <EmptyBackfill
            facts={queued({
              runtime: {
                ...runtime,
                workerStatus: {
                  status: "stale",
                  temporalIdentityComparison: {
                    detail: "heartbeat is stale",
                    status: "match",
                  },
                },
              },
            })}
          />
        </div>
        <div className="rounded-card border border-border bg-bg-elev p-4">
          <EmptyBackfill facts={queued({ queue: { blockingPropertyLabel: "shop.example.com" } })} />
        </div>
        <div className="rounded-card border border-border bg-bg-elev p-4">
          <EmptyBackfill facts={queued({})} />
        </div>
      </div>
    </ProofCanvas>
  ),
};
