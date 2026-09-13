import { backlinksSnapshotFixture } from "@/components/backlinks/backlinks-fixtures";
import { StoredBacklinksView } from "@/components/demo-research/StoredBacklinksView";
import { StoredDomainOverviewView } from "@/components/demo-research/StoredDomainOverviewView";
import { StoredKeywordResearchView } from "@/components/demo-research/StoredKeywordResearchView";
import {
  domainOverviewHistoryFixture,
  domainOverviewReportFixture,
} from "@/components/domain-overview/fixtures";
import type { StoredDomainOverviewResult } from "@/lib/domain-overview/stored";
import type { StoredKeywordResearchResult } from "@/lib/keyword-research/stored-read";
import type { Meta, StoryObj } from "@storybook/react";
import { StoredResearchEmpty } from "./StoredResearchEmpty";
import { StoredResultSelector } from "./StoredResultSelector";

const fetchedAt = "2026-08-12T12:00:00.000Z";
const freshUntil = "2026-09-11T12:00:00.000Z";
const keywordResult: StoredKeywordResearchResult = {
  cached: true,
  costCents: 0,
  countryCode: "US",
  fetchedAt,
  freshUntil,
  includeClickstream: false,
  languageCode: "en",
  mode: "seed",
  ok: true,
  partial: false,
  provider: "dataforseo",
  requestKey: "a".repeat(64),
  resultLimit: 100,
  rows: [
    {
      alreadySaved: false,
      alreadyTracked: false,
      competition: 0.4,
      cpcCents: 125,
      difficulty: 24,
      intent: "commercial",
      keyword: "standing desk",
      monthlyTrend: [],
      searchVolume: 12_400,
      source: "related",
    },
  ],
  savedAt: fetchedAt,
  seed: "standing desk",
  sources: [{ cached: true, costCents: 0, returned: 1, source: "related", status: "ok" }],
  stale: false,
};
const storedDomain: StoredDomainOverviewResult = {
  ...domainOverviewReportFixture,
  cached: true,
  costCents: 0,
  countryCode: "US",
  freshUntil,
  history: domainOverviewHistoryFixture,
  keywords: domainOverviewReportFixture.keywords.ok
    ? domainOverviewReportFixture.keywords.data
    : null,
  pages: domainOverviewReportFixture.pages.ok ? domainOverviewReportFixture.pages.data : null,
  partial: false,
  savedAt: fetchedAt,
  stale: false,
};

const meta = {
  component: StoredResultSelector,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-4 text-fg sm:p-6">
        <Story />
      </div>
    ),
  ],
  parameters: {
    chromatic: { viewports: [390, 1440] },
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/app/prj_demo/keyword-research" },
    },
  },
  title: "Demo research/Stored results",
} satisfies Meta<typeof StoredResultSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KeywordResearch: Story = {
  args: { actorKind: "viewer", options: [], title: "Keyword Research" },
  render: () => <StoredKeywordResearchView result={keywordResult} />,
};

export const Backlinks: Story = {
  args: { actorKind: "viewer", options: [], title: "Backlinks" },
  render: () => (
    <StoredBacklinksView
      result={{ ...backlinksSnapshotFixture, fetchedAt, freshUntil, stale: false }}
    />
  ),
};

export const DomainOverview: Story = {
  args: { actorKind: "viewer", options: [], title: "Domain Overview" },
  render: () => <StoredDomainOverviewView result={storedDomain} />,
};

export const OwnerNewLookupEntry: Story = {
  args: {
    actorKind: "owner",
    options: [{ label: "standing desk - US/en", value: keywordResult.requestKey }],
    selectedValue: keywordResult.requestKey,
    title: "Keyword Research",
  },
};

export const ViewerEmpty: Story = {
  args: { actorKind: "viewer", options: [], title: "Backlinks" },
  render: () => <StoredResearchEmpty title="Backlinks" />,
};

export const StaleStoredResult: Story = {
  args: { actorKind: "viewer", options: [], title: "Domain Overview" },
  render: () => <StoredDomainOverviewView result={{ ...storedDomain, stale: true }} />,
};
