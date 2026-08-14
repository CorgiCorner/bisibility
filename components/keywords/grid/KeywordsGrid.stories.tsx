import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { KeywordImportProvider } from "@/components/keywords/import/KeywordImportProvider";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { Meta, StoryObj } from "@storybook/react";
import { KeywordsGrid } from "./KeywordsGrid";

const actionArgs = {
  addKeywordsAction: async () => undefined,
  bulkClearTargetAction: async () => undefined,
  bulkDeleteAction: async () => undefined,
  bulkSetFrequencyAction: async () => undefined,
  bulkSetTargetAction: async () => undefined,
  bulkTagAction: async () => undefined,
  canCreateKeyword: true,
  canDeleteKeyword: true,
  canManageProviders: true,
  canUpdateKeyword: true,
  deletableSavedViewIds: [],
  getFirstCheckRunPlanAction: async () => ({
    budget: { capCents: 5000, spentCents: 1250 },
    budgetExhausted: false,
    estimatedCostPerCheckCents: 0.1,
    isSampleProject: false,
    providerReady: true,
    providers: ["dataforseo", "serpapi"],
    readyCount: 12,
    scope: {
      depth: "Top 100",
      device: "Desktop",
      engine: "Google",
      frequency: "Daily",
      location: "United States",
    },
  }),
  importTopQueriesAction: async () => ({
    queries: ["open source rank tracker", "rank tracking for agencies"],
  }),
  queueFirstChecksAction: async () => ({ queued: 11 }),
  runCheckNowAction: async () => undefined,
  tagSuggestions: ["Product", "Docs", "Comparison", "Integration"],
  updateKeywordAction: async () => undefined,
  updateKeywordScheduleAction: async () => undefined,
};

const meta = {
  title: "Keywords/Workspace",
  component: KeywordsGrid,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <SessionSpendProvider>
        <KeywordImportProvider activeProjectId="prj_7Kd2Qf9m">
          <div className="min-h-screen bg-bg p-6 text-fg">
            <Story />
          </div>
        </KeywordImportProvider>
      </SessionSpendProvider>
    ),
  ],
} satisfies Meta<typeof KeywordsGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { ...actionArgs, projectId: "prj_7Kd2Qf9m", rows: keywordRows },
};

export const Empty: Story = {
  args: { ...actionArgs, projectId: "prj_7Kd2Qf9m", rows: [] },
};

// No-data workspace: keywords are queued but none has a first check, so every row
// reports hasRankData === false. Renders the pending banner + queued table.
const pendingRows = keywordRows.slice(0, 12).map((row) => ({
  ...row,
  checkState: "never_checked" as const,
  hasRankData: false,
  lastCheckAt: null,
  lastCheckStatus: null,
  position: 101,
  positionBaseline: null,
  positionHistory: [],
  previousPosition: 101,
  rankingPath: null,
  rankingUrl: null,
  rankingUrlHistory: [],
  sparkline: [],
}));

export const Pending: Story = {
  args: {
    ...actionArgs,
    projectId: "prj_7Kd2Qf9m",
    providerConnected: false,
    rows: pendingRows,
  },
};

export const PendingReady: Story = {
  args: {
    ...actionArgs,
    projectId: "prj_7Kd2Qf9m",
    providerConnected: true,
    rows: pendingRows,
  },
};

export const PendingFilteredEmpty: Story = {
  args: {
    ...actionArgs,
    initialViewConfig: {
      filters: { ...emptyKeywordFilters, change: "up", position: ["11-50"] },
      lens: { device: "desktop", locationId: null },
      search: "",
      surface: "keywords",
      version: 1,
    },
    lens: { device: "desktop", locationId: null },
    projectId: "prj_7Kd2Qf9m",
    providerConnected: false,
    rows: pendingRows,
  },
};

export const Truncated: Story = {
  args: {
    ...actionArgs,
    projectId: "prj_7Kd2Qf9m",
    rows: keywordRows,
    totalKeywordCount: 1240,
  },
};

export const TargetUrlStates: Story = {
  args: {
    ...actionArgs,
    projectId: "prj_7Kd2Qf9m",
    rows: [
      { ...keywordRows[0], targetUrl: null },
      {
        ...keywordRows[1],
        rankingPath: "/blog/google-analytics",
        rankingUrl: "https://acme.dev/blog/google-analytics",
      },
      {
        ...keywordRows[2],
        checkState: "never_checked",
        hasRankData: false,
        rankingPath: null,
        rankingUrl: null,
      },
    ],
  },
};

// Active lens: the grid is viewed through a single location + device (the fixtures'
// Austin city rows), showing one row per term for that lens (design §6).
export const CityLens: Story = {
  args: {
    ...actionArgs,
    lens: { device: "desktop", locationId: "loc_us_austin" },
    projectId: "prj_7Kd2Qf9m",
    rows: keywordRows,
  },
};

const marketLocations = [
  {
    canonicalKey: "country:us@en",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "country:us@en",
    kind: "country" as const,
    languageLabel: "English",
  },
  {
    canonicalKey: "country:es@es",
    cityName: null,
    countryCode: "ES",
    displayName: "Spain",
    gl: "es",
    hl: "es",
    id: "country:es@es",
    kind: "country" as const,
    languageLabel: "Spanish",
  },
  {
    canonicalKey: "country:es@en",
    cityName: null,
    countryCode: "ES",
    displayName: "Spain",
    gl: "es",
    hl: "en",
    id: "country:es@en",
    kind: "country" as const,
    languageLabel: "English",
  },
];

const groupedMarketRows = keywordRows.slice(0, 2).flatMap((source, keywordIndex) =>
  marketLocations.flatMap((location, marketIndex) =>
    ["Desktop", "Mobile"].map((device, deviceIndex) => ({
      ...source,
      device,
      id: `${source.id}-${marketIndex}-${deviceIndex}`,
      location,
      locationName: `${location.displayName} / ${location.languageLabel}`,
      position: source.position + marketIndex + deviceIndex,
      positionBaseline:
        source.positionBaseline == null
          ? null
          : source.positionBaseline + keywordIndex + marketIndex,
      rankingUrl: `https://example.com/${keywordIndex}/${marketIndex}/${deviceIndex}`,
      volume: marketIndex === 2 ? 0 : source.volume + marketIndex * 500,
      volumeKnown: marketIndex !== 2,
    })),
  ),
);

export const GroupedMarkets: Story = {
  args: {
    ...actionArgs,
    projectId: "prj_7Kd2Qf9m",
    rows: groupedMarketRows,
  },
};
