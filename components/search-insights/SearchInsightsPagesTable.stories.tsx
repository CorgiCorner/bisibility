import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { SearchInsightsPagesLens, SearchInsightsPagesTable } from "./SearchInsightsPagesTable";
import { SearchInsightsRowsCard } from "./SearchInsightsRowsCard";
import {
  KEY_EVENTS_NOT_CONFIGURED,
  MANAGE_SESSIONS_LABEL,
  ORGANIC_SESSIONS_LABEL,
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

const trafficHeaderWidths = [
  { id: "sessions", label: ORGANIC_SESSIONS_LABEL, minWidth: 136 },
  { id: "engagement", label: "Engagement", minWidth: 104 },
  { id: "key-events", label: "Key events", minWidth: 92 },
] as const;

function assertTrafficHeaderWidths(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  for (const { id, label, minWidth } of trafficHeaderWidths) {
    const header = canvas.getByRole("columnheader", { name: label });
    const headerLabel = header.querySelector<HTMLSpanElement>("span.truncate");
    if (!headerLabel) throw new Error(`Traffic header ${id} is missing its label.`);

    expect(header.getBoundingClientRect().width).toBeGreaterThanOrEqual(minWidth);
    expect(headerLabel.scrollWidth).toBeLessThanOrEqual(headerLabel.clientWidth);
  }
}

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
  play: async ({ canvasElement }) => {
    assertTrafficHeaderWidths(canvasElement);
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
      empty={false}
      emptyReason="Google reported no search traffic for this property in this window."
      title={TABLE_TITLES.pages}
      toolbar={
        <div className="ms-auto shrink-0">
          <SearchInsightsPagesLens lens="traffic" showSessions />
        </div>
      }
    >
      <SearchInsightsPagesTable
        bordered={false}
        keyEventsConfigured={false}
        lens="traffic"
        paging={{
          footerStart: (
            <a
              className="font-sans tabular-nums text-ui-caption text-fg-muted no-underline underline-offset-3 hover:text-fg hover:underline focus-visible:underline"
              href="/app/prj_story/integrations?connect=ga4"
            >
              {MANAGE_SESSIONS_LABEL}
            </a>
          ),
          onChange: () => undefined,
          page: 1,
          pageSize: 10,
          rowCount: trafficLensRows.length,
        }}
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

export const ServerPages: Story = {
  args: { rows: storyPageRows },
  render: () => (
    <div className="max-w-3xl">
      <SearchInsightsRowsCard
        caption={TABLE_CAPTIONS.pages}
        empty={false}
        title={TABLE_TITLES.pages}
      >
        <SearchInsightsPagesTable
          bordered={false}
          paging={{ onChange: () => {}, page: 3, pageSize: 10, rowCount: 184 }}
          rows={storyPageRows}
        />
      </SearchInsightsRowsCard>
    </div>
  ),
};
