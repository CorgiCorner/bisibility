import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { DateDisplayProvider } from "@/components/dates/DateFormatProvider";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { KeywordRow } from "@/lib/queries/keywords";
import trackerMessages from "@/messages/core/en/project-rank-tracker.json";
import messages from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import sharedMessages from "@/messages/core/en/shared.json";
import type { Meta, StoryObj } from "@storybook/react";
import { KeywordHeaderCard } from "./KeywordHeaderCard";
import { keywordRows } from "./keywords-fixtures";
import { PositionHistoryCard } from "./PositionHistoryCard";
import { RetrievedResultsCard } from "./RetrievedResultsCard";

const checkedAt = new Date(Date.now() - 60_000).toISOString();
const keyword: KeywordRow = {
  ...keywordRows[0],
  keyword: "voice dictation app",
  id: "kw_abcdefghijklmnopqrstuvwx",
  device: "desktop",
  location: { ...keywordRows[0].location, languageLabel: "English" },
  createdAt: "2026-07-18T00:00:00Z",
  lastCheckAt: checkedAt,
  rankingUrl: null,
  currentExpectedUrl: "/dictation",
  position: 101,
  trackedDepth: 100,
  projectSerpDepth: 20,
  hasRankData: true,
  volumeKnown: false,
  cpcKnown: false,
  difficultyKnown: false,
  tags: [],
  intent: null,
  topic: null,
  checkSchedule: { name: "Daily", nextCheckAt: null, publicId: "sch_example" },
  positionObservations: [5, null, null].map((position, index) => ({
    checkedAt: new Date(Date.now() - (2 - index) * 86400000).toISOString(),
    label: `Day ${index + 1}`,
    position,
    comparisonKey: index === 0 ? "v2:20" : "v2:100",
  })),
};

const results: RetrievedResults = {
  checkId: "check_abcdefghijklmnopqrstuvwx",
  checkedAt,
  provider: "serpapi",
  providerLabel: "SerpApi",
  tier: "full",
  requestedDepth: 100,
  retrievedPositions: 100,
  trackedPosition: null,
  stoppedAtResult: false,
  rows: Array.from({ length: 100 }, (_, index) => ({
    position: index + 1,
    domain: `result${index + 1}.example.org`,
    url: `https://result${index + 1}.example.org/dictation`,
    title: `Voice dictation software ${index + 1}`,
    tracked: false,
  })),
  features: [],
  aiOverview: null,
  fullDetailUntil: null,
};
const entry: StoredResultsIndexEntry = {
  ...results,
  position: null,
  degradedToCountry: false,
};

const meta = {
  title: "Keyword detail/Information layout",
  component: KeywordHeaderCard,
  args: {
    canUpdateKeyword: true,
    keyword,
    scheduleTargets: [
      keyword,
      {
        ...keyword,
        id: "kw_mobile",
        device: "mobile",
        checkSchedule: { name: "Weekly", publicId: "sch_weekly", nextCheckAt: null },
      },
    ],
    projectId: "prj_example",
    providerLabel: "SerpApi",
    rankState: "not_ranked",
    updateKeywordAction: async () => undefined,
    runCheckNowAction: async () => ({ status: "queued", runId: "rcr_abcdefghijklmnopqrstuvwx" }),
  },
  decorators: [
    (Story, context) => (
      <FeatureMessagesProvider
        locale="en"
        messages={mergeMessageCatalogs(sharedMessages, trackerMessages, messages)}
        timeZone="UTC"
      >
        <DateDisplayProvider>
          <SessionSpendProvider>
            <ToastProvider>
              <main
                className="mx-auto grid max-w-[1120px] gap-4 bg-bg p-4 text-fg"
                data-theme={context.parameters.theme ?? "light"}
              >
                <Story />
                <PositionHistoryCard
                  keyword={context.args.keyword}
                  chartState="normal"
                  timeZone="UTC"
                />
                <RetrievedResultsCard
                  keyword={context.args.keyword}
                  entries={[entry]}
                  initialResults={results}
                  loadResults={async () => [results]}
                  rankingUrl={null}
                  retentionDays={30}
                  timeZone="UTC"
                />
              </main>
            </ToastProvider>
          </SessionSpendProvider>
        </DateDisplayProvider>
      </FeatureMessagesProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true },
    chromatic: { viewports: [390, 768, 1280] },
  },
} satisfies Meta<typeof KeywordHeaderCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const NotRanked: Story = {};
export const MobileTarget: Story = { args: { keyword: { ...keyword, device: "mobile" } } };
export const Dark: Story = { parameters: { theme: "dark" } };
