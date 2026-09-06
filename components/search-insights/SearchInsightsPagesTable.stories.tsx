import type { Meta, StoryObj } from "@storybook/react";
import { SearchInsightsPagesLens, SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsRowsCard } from "./SearchInsightsRowsCard";
import {
  KEY_EVENTS_NOT_CONFIGURED,
  MANAGE_SESSIONS_LABEL,
  TABLE_CAPTIONS,
  TABLE_TITLES,
} from "./search-insights-copy";
import { storyPageRows } from "./search-insights-story-fixtures";

const meta = {
  component: SearchInsightsPagesTable,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true } },
  title: "Search Console/PagesTable",
} satisfies Meta<typeof SearchInsightsPagesTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchClicks: Story = { args: { rows: storyPageRows } };

const trafficLensRows = [
  { ...storyPageRows[0], engagementRate: 0.68, keyEvents: 53, sessions: 11_500 },
  { ...storyPageRows[1], engagementRate: 0.61, keyEvents: 37, sessions: 8_420 },
  { ...storyPageRows[2], engagementRate: 0.57, keyEvents: 22, sessions: 5_180 },
];

export const TrafficLensWithKeyEvents: Story = {
  args: {
    keyEventsConfigured: true,
    lens: "traffic",
    rows: trafficLensRows,
    showSessions: true,
  },
};

export const TrafficLensUnknownMetrics: Story = {
  args: {
    keyEventsConfigured: true,
    lens: "traffic",
    rows: [
      trafficLensRows[0],
      { ...trafficLensRows[1], engagementRate: null, keyEvents: null },
      trafficLensRows[2],
    ],
    showSessions: true,
  },
};

function TrafficLensNoKeyEventsFrame() {
  return (
    <SearchInsightsRowsCard
      caption={
        <span>
          {TABLE_CAPTIONS.pages} {KEY_EVENTS_NOT_CONFIGURED}
        </span>
      }
      footerEnd={
        <a
          className="font-sans tabular-nums text-ui-caption text-fg-muted no-underline underline-offset-3 hover:text-fg hover:underline focus-visible:underline"
          href="/app/prj_story/integrations?connect=ga4"
        >
          {MANAGE_SESSIONS_LABEL}
        </a>
      }
      headerEnd={<SearchInsightsPagesLens lens="traffic" showSessions />}
      emptyReason="Google reported no search traffic for this property in this window."
      onCollapse={() => undefined}
      onMore={() => undefined}
      show={trafficLensRows.length}
      shown={trafficLensRows.length}
      title={TABLE_TITLES.pages}
      total={trafficLensRows.length}
    >
      <SearchInsightsPagesTable
        keyEventsConfigured={false}
        lens="traffic"
        rows={trafficLensRows}
        showSessions
      />
    </SearchInsightsRowsCard>
  );
}

export const TrafficLensNoKeyEvents: Story = {
  args: { rows: trafficLensRows },
  render: () => <TrafficLensNoKeyEventsFrame />,
};
