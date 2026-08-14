import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type {
  AnalyzeDomainOverviewAction,
  LoadDomainHistoryAction,
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
  SaveSelectedKeywordsAction,
} from "@/lib/actions/domain-overview";
import type { Meta, StoryObj } from "@storybook/react";
import { userEvent, within } from "storybook/test";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import {
  domainOverviewHistoryFixture,
  domainOverviewMarketFixture,
  domainOverviewReportFixture,
} from "./fixtures";

const analyzeAction = (async (input: unknown) => {
  const request = input as { estimateOnly?: boolean };
  return request.estimateOnly
    ? {
        cached: false,
        estimate: true,
        estimatedCostCents: 4,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: domainOverviewMarketFixture.locationCode,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      }
    : domainOverviewReportFixture;
}) as AnalyzeDomainOverviewAction;
const loadingAnalyzeAction = (async (input: unknown) => {
  const request = input as { estimateOnly?: boolean };
  if (request.estimateOnly) return analyzeAction(input);
  return new Promise(() => undefined);
}) as AnalyzeDomainOverviewAction;
const loadHistoryAction = (async () => ({
  cached: false,
  costCents: 12,
  data: domainOverviewHistoryFixture,
  fetchedAt: "2026-08-12T12:00:00.000Z",
  ok: true,
})) as LoadDomainHistoryAction;
const loadKeywordsPageAction = (async () => ({
  cached: false,
  costCents: 2,
  data: { consumedCount: 0, costCents: 2, rows: [], totalCount: 12_940 },
  fetchedAt: "2026-08-12T12:00:00.000Z",
  ok: true,
})) as LoadDomainKeywordsPageAction;
const loadPagesPageAction = (async () => ({
  cached: false,
  costCents: 3,
  data: { consumedCount: 0, costCents: 3, rows: [], totalCount: 1_204 },
  fetchedAt: "2026-08-12T12:00:00.000Z",
  ok: true,
})) as LoadDomainPagesPageAction;
const saveSelectedKeywordsAction = (async (input: unknown) => {
  const rows = (input as { rows: unknown[] }).rows;
  return { created: [], duplicateCount: 0, savedCount: rows.length };
}) as SaveSelectedKeywordsAction;

const trackedMarkets = [
  {
    canonicalKey: "ES",
    cityName: null,
    countryCode: "ES",
    displayName: "Spain",
    kind: "country" as const,
    languageCode: "es",
    languageLabel: "Spanish",
    locationCode: 2724,
    provenance: "Malaga tracked at city level - domain analysis runs on the country pair.",
    regionName: null,
    researchAvailable: true,
  },
  {
    canonicalKey: "ES@en",
    cityName: null,
    countryCode: "ES",
    displayName: "Spain",
    kind: "country" as const,
    languageCode: "en",
    languageLabel: "English",
    locationCode: 2724,
    provenance: null,
    regionName: null,
    researchAvailable: false,
  },
];

const catalogMarkets = [
  {
    ...trackedMarkets[0],
    canonicalKey: "US",
    countryCode: "US",
    displayName: "United States",
    languageCode: "en",
    languageLabel: "English",
    locationCode: 2840,
    provenance: null,
  },
];

const meta = {
  component: DomainOverviewWorkspace,
  decorators: [
    (Story) => (
      <SessionSpendProvider>
        <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
          <Story />
        </div>
      </SessionSpendProvider>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Domain Overview/Workspace",
} satisfies Meta<typeof DomainOverviewWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

const common = {
  analyzeAction,
  context: {
    catalogMarkets,
    competitorDomains: ["competitor-one.example.com", "competitor-two.example.com"],
    costContext: { capCents: 5000, spentCents: 1419 },
    defaultTarget: "example.com",
    providerStatus: "connected" as const,
    recentTargets: [],
    trackedMarkets,
  },
  initialEstimate: {
    cached: false,
    costCents: 4,
    freshCostCents: 6,
    historyCostCents: 12,
    keywordPageCostCents: 2,
    loading: false,
    pagePageCostCents: 3,
    valid: true,
  },
  loadHistoryAction,
  loadKeywordsPageAction,
  loadPagesPageAction,
  market: trackedMarkets[0],
  projectId: "prj_story",
  projectRef: "prj_story",
  selectMarketAction: async (input: unknown) => {
    const value = input as { canonicalKey: string };
    return { canonicalKey: value.canonicalKey, locationCode: 1_026_201, supported: true };
  },
  saveSelectedKeywordsAction,
};

export const Idle: Story = {
  args: {
    ...common,
    initialEstimate: {
      cached: false,
      costCents: null,
      freshCostCents: null,
      historyCostCents: null,
      keywordPageCostCents: null,
      loading: false,
      pagePageCostCents: null,
      valid: false,
    },
    initialOutcome: null,
  },
};

export const Results: Story = {
  args: {
    ...common,
    context: {
      ...common.context,
      recentTargets: [
        {
          cachedUntil: "2026-08-13T12:00:00.000Z",
          fetchedAt: "2026-08-12T12:00:00.000Z",
          languageCode: "en",
          locationCode: domainOverviewMarketFixture.locationCode,
          scope: "root",
          target: "other.example.com",
        },
      ],
    },
    initialOutcome: domainOverviewReportFixture,
    initialScope: "root",
    initialTarget: domainOverviewReportFixture.target,
  },
};

export const Loading: Story = {
  args: {
    ...common,
    analyzeAction: loadingAnalyzeAction,
    initialOutcome: null,
    initialScope: "root",
    initialTarget: "example.com",
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /analyze domain/i }));
  },
};

export const NoData: Story = {
  args: {
    ...common,
    initialOutcome: { ...domainOverviewReportFixture, overview: null, state: "no_data" },
    initialTarget: "new.example.com",
  },
};
