import { Sparkline } from "@/components/charts/Sparkline";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { ResearchIntentChip } from "./ResearchIntentChip";
import { ResearchKeywordCell } from "./ResearchKeywordCell";
import { ResearchUnavailableMetric } from "./ResearchUnavailableMetric";
import { chronologicalTrend, difficultyPillStyle } from "./research-results-model";
import type { ResearchResultsTableRow } from "./research-results-table-state";

type ResearchResultsColumnMessages = {
  columns: {
    cpc: string;
    cpcTitle: string;
    cpcUnavailable: string;
    difficulty: string;
    difficultyShort: string;
    difficultyUnavailable: string;
    intent: string;
    keyword: string;
    source: string;
    trend: string;
    trendAria: (values: { keyword: string }) => string;
    trendUnavailable: string;
    volume: string;
    volumeUnavailable: string;
  };
  formatNumber: (value: number) => string;
};

export function researchResultsColumns(input: {
  canRemoveSaved: boolean;
  messages: ResearchResultsColumnMessages;
  metricsAvailable: boolean;
  onToggleSave?: (row: GroupedResearchRow) => void;
}): DataTableColumn<ResearchResultsTableRow>[] {
  return [
    {
      accessorKey: "keyword",
      cell: ({ row }) => (
        <ResearchKeywordCell
          canRemoveSaved={input.canRemoveSaved}
          onToggleSave={input.onToggleSave}
          row={row.original}
        />
      ),
      header: input.messages.columns.keyword,
      id: "keyword",
      meta: {
        flex: 1.5,
        lockVisible: true,
        pin: "left",
        sortable: false,
        title: input.messages.columns.keyword,
      },
      minSize: 212,
      size: 212,
    },
    {
      accessorFn: (row) => row.searchVolume ?? -1,
      cell: ({ row }) =>
        input.metricsAvailable ? (
          <span className="font-sans tabular-nums text-[12px]">
            {row.original.searchVolume == null
              ? "-"
              : input.messages.formatNumber(row.original.searchVolume)}
          </span>
        ) : (
          <ResearchUnavailableMetric label={input.messages.columns.volumeUnavailable} />
        ),
      header: input.messages.columns.volume,
      id: "searchVolume",
      meta: { align: "end", title: input.messages.columns.volume },
      minSize: 92,
      size: 92,
      sortDescFirst: true,
    },
    {
      cell: ({ row }) =>
        input.metricsAvailable ? (
          <Sparkline
            ariaLabel={input.messages.columns.trendAria({ keyword: row.original.keyword })}
            data={chronologicalTrend(row.original.monthlyTrend).map((point) => point.searchVolume)}
          />
        ) : (
          <ResearchUnavailableMetric label={input.messages.columns.trendUnavailable} />
        ),
      header: input.messages.columns.trend,
      id: "trend",
      meta: { sortable: false, title: input.messages.columns.trend },
      minSize: 104,
      size: 104,
    },
    {
      cell: ({ row }) =>
        input.metricsAvailable ? (
          <span
            className="rounded-full border px-2 py-0.5 font-sans tabular-nums text-[11px] font-semibold"
            style={difficultyPillStyle(row.original.difficulty)}
          >
            {row.original.difficulty ?? "-"}
          </span>
        ) : (
          <ResearchUnavailableMetric label={input.messages.columns.difficultyUnavailable} />
        ),
      header: input.messages.columns.difficultyShort,
      id: "difficulty",
      meta: { sortable: false, title: input.messages.columns.difficulty },
      minSize: 68,
      size: 68,
    },
    {
      cell: ({ row }) =>
        input.metricsAvailable ? (
          <span className="font-sans tabular-nums text-[11.5px]">
            {row.original.cpcCents == null ? "-" : formatEstimateCents(row.original.cpcCents)}
          </span>
        ) : (
          <ResearchUnavailableMetric label={input.messages.columns.cpcUnavailable} />
        ),
      header: input.messages.columns.cpc,
      id: "cpcCents",
      meta: { align: "end", sortable: false, title: input.messages.columns.cpcTitle },
      minSize: 80,
      size: 80,
    },
    {
      cell: ({ row }) => <ResearchIntentChip intent={row.original.intent} />,
      header: input.messages.columns.intent,
      id: "intent",
      meta: { sortable: false, title: input.messages.columns.intent },
      minSize: 160,
      size: 160,
    },
    {
      cell: ({ row }) => (
        <code className="rounded bg-bg-sunken px-2 py-1 text-[10.5px] text-fg-muted">
          {row.original.source}
        </code>
      ),
      header: input.messages.columns.source,
      id: "source",
      meta: { sortable: false, title: input.messages.columns.source },
      minSize: 104,
      size: 104,
    },
  ];
}
