import type { SearchInsightsSort } from "@/lib/search-insights/queries/top-rows-sort";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchInsightsRowsCard } from "./SearchInsightsRowsCard";
import { SearchInsightsQueriesTable } from "./SearchInsightsRowsTable";
import { nextSort } from "./search-insights-rows-model";

const rows = [
  {
    clicks: 2_140,
    ctr: 0.057,
    impressions: 37_410,
    position: 4.2,
    query: "rank tracking software",
  },
  {
    clicks: 862,
    ctr: 0.034,
    impressions: 25_480,
    position: 11.8,
    query: "daily keyword position checks",
  },
  {
    clicks: 431,
    ctr: 0.026,
    impressions: 16_730,
    position: 18.6,
    query: "self-hosted rank tracker",
  },
] as const;

const expandedRows = Array.from({ length: 5_000 }, (_, index) => ({
  clicks: 5_000 - index,
  ctr: 0.057,
  impressions: 37_410 - index,
  position: 4.2 + index / 10,
  query: `expanded query ${index + 1}`,
}));

function QueriesStory() {
  const [sort, setSort] = useState<SearchInsightsSort>({ direction: "desc", key: "clicks" });
  const [tracked, setTracked] = useState<ReadonlySet<string>>(new Set());
  return (
    <div className="max-w-3xl">
      <SearchInsightsRowsCard
        caption="Stored Search Console rows"
        onCollapse={() => {}}
        onMore={() => {}}
        show={10}
        shown={rows.length}
        title="Top queries"
        total={rows.length}
      >
        <SearchInsightsQueriesTable
          onOpen={() => {}}
          onTrack={(row) => setTracked((current) => new Set(current).add(row.query))}
          rows={rows}
          sort={{ onSort: (key) => setSort((current) => nextSort(current, key)), value: sort }}
          tracked={tracked}
        />
      </SearchInsightsRowsCard>
    </div>
  );
}

const meta = {
  component: SearchInsightsQueriesTable,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-bg p-6 text-fg">
        <Story />
      </div>
    ),
  ],
  parameters: { layout: "fullscreen" },
  title: "Search Console/Top queries table",
} satisfies Meta<typeof SearchInsightsQueriesTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompactRows: Story = {
  args: { rows, tracked: new Set() },
  render: () => <QueriesStory />,
};

export const ExpandedVirtualized: Story = {
  args: { rows: expandedRows, scroll: true, tracked: new Set() },
  render: () => (
    <div className="max-w-3xl">
      <SearchInsightsRowsCard
        caption="Stored Search Console rows"
        onCollapse={() => {}}
        onMore={() => {}}
        show="all"
        shown={expandedRows.length}
        title="Top queries"
        total={expandedRows.length}
      >
        <SearchInsightsQueriesTable rows={expandedRows} scroll tracked={new Set()} />
      </SearchInsightsRowsCard>
    </div>
  ),
};
