import { KeywordDetailStoryThemes } from "@/components/keyword-detail/shared/story-theme-preview";
import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { KeywordMetricCards } from "@/components/keywords/KeywordMetricCards";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { ToastProvider } from "@/components/ui";
import type { ProjectCostContext } from "@/lib/queries/cost-calculator";
import type { KeywordTrafficDetail, PageTrafficSnapshotLike } from "@/lib/queries/keyword-traffic";
import type { Meta, StoryObj } from "@storybook/react";

const keyword = {
  ...keywordRows[0],
  completedComparableChecks: [
    {
      checkedAt: "2026-07-02T09:00:00.000Z",
      position: 5,
      rankingUrl: "https://acme.dev/headless-cms",
    },
    {
      checkedAt: "2026-07-03T09:00:00.000Z",
      position: 3,
      rankingUrl: "https://acme.dev/headless-cms",
    },
  ],
  intent: "High intent",
  positionBaseline: 5,
  targetUrl: "https://acme.dev/legacy-headless-cms",
  positionHistory: keywordRows[0].positionHistory.map((point, index, history) => ({
    ...point,
    position: index === history.length - 2 ? 5 : point.position,
  })),
  rankingUrlHistory: keywordRows[0].rankingUrlHistory.map((period, index): typeof period => ({
    ...period,
    note: period.isCurrent ? "Current" : index === 0 ? "First seen ranking" : null,
    url: "https://acme.dev/headless-cms",
  })),
  tags: ["Product", "High intent", "Priority"],
  topic: "Product",
  urlPresence: {
    canonicalOk: true,
    checkedAt: "2026-08-02T00:00:00.000Z",
    coverageState: "Submitted and indexed",
    indexed: true,
    lastCrawlAt: "2026-08-01T00:00:00.000Z",
    url: "https://example.com/headless-cms",
    verdict: "PASS",
  },
};
const costContext = {
  capCents: 5_000,
  costPerCheckCents: 2,
  cronExpression: null,
  depth: 20,
  deviceCount: 1,
  devices: ["desktop"],
  frequency: "weekly",
  keywordCount: 1,
  locationCount: 1,
  projectName: "Demo",
  providerId: "dataforseo",
  rawFrequency: "weekly",
  spentCents: 0,
  timezone: "Europe/Warsaw",
} satisfies ProjectCostContext;
const query = {
  clicks: 412,
  ctr: 0.045,
  date: new Date("2026-08-02T00:00:00.000Z"),
  impressions: 9180,
  position: 3.8,
  provider: "gsc",
  windowDays: 28,
} satisfies NonNullable<KeywordTrafficDetail["query"]>;
const pages = [
  {
    bounceRate: 0.54,
    date: new Date("2026-08-02T00:00:00.000Z"),
    engagementRate: null,
    keyEvents: null,
    path: "/headless-cms",
    provider: "plausible",
    scrollDepth: 0.62,
    sessions: 2318,
    visitDurationSeconds: 82,
    visitors: 1612,
    windowDays: 28,
  },
] satisfies PageTrafficSnapshotLike[];
const actions = {
  addKeywordsAction: async () => undefined,
  bulkDeleteAction: async () => undefined,
  canCreateKeyword: true,
  canUpdateKeyword: true,
  costContext,
  createKeywordAlertAction: async () => undefined,
  projectId: "prj_demo",
  runCheckNowAction: async () => undefined,
  tagSuggestions: ["Product", "Docs", "Comparison"],
  updateKeywordAction: async () => undefined,
};

const meta = {
  component: KeywordHeaderCard,
  decorators: [
    () => (
      <KeywordDetailStoryThemes>
        <ToastProvider>
          <main className="grid max-w-6xl gap-4 text-fg">
            <KeywordHeaderCard {...actions} keyword={keyword} />
            <KeywordMetricCards keyword={keyword} keywordContext="full" />
            <PositionHistoryCard
              chartState="normal"
              keyword={keyword}
              timeZone={costContext.timezone}
            />
            <KeywordTrafficCard
              projectRef="prj_demo"
              traffic={{
                hasAnalyticsConnection: true,
                hasSearchConsoleConnection: true,
                pages,
                query,
              }}
              trafficState="both"
            />
            <RankingUrlHistory keyword={keyword} />
          </main>
        </ToastProvider>
      </KeywordDetailStoryThemes>
    ),
  ],
  parameters: {
    chromatic: { viewports: [390, 768, 1440] },
    nextjs: { appDirectory: true },
  },
  title: "Keyword detail/Normal detail",
} satisfies Meta<typeof KeywordHeaderCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Normal: Story = { args: { ...actions, keyword } };
