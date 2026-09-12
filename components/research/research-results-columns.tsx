import { Sparkline } from "@/components/charts/Sparkline";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { ResearchKeywordCell } from "./ResearchKeywordCell";
import { ResearchUnavailableMetric } from "./ResearchUnavailableMetric";
import { chronologicalTrend, difficultyPillStyle, IntentChip } from "./research-results-model";
import type { ResearchResultsTableRow } from "./research-results-table-state";

export function researchResultsColumns(input: {
  canRemoveSaved: boolean;
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
      header: "Keyword",
      id: "keyword",
      meta: { flex: 1.5, lockVisible: true, pin: "left", sortable: false, title: "Keyword" },
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
              : row.original.searchVolume.toLocaleString("en-US")}
          </span>
        ) : (
          <ResearchUnavailableMetric label="Search volume unavailable" />
        ),
      header: "Volume",
      id: "searchVolume",
      meta: { align: "end", title: "Volume" },
      minSize: 92,
      size: 92,
      sortDescFirst: true,
    },
    {
      cell: ({ row }) =>
        input.metricsAvailable ? (
          <Sparkline
            ariaLabel={`Monthly volume trend for ${row.original.keyword}`}
            data={chronologicalTrend(row.original.monthlyTrend).map((point) => point.searchVolume)}
          />
        ) : (
          <ResearchUnavailableMetric label="Search trend unavailable" />
        ),
      header: "Trend",
      id: "trend",
      meta: { sortable: false, title: "Trend" },
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
          <ResearchUnavailableMetric label="KD unavailable" />
        ),
      header: "KD",
      id: "difficulty",
      meta: { sortable: false, title: "Keyword difficulty" },
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
          <ResearchUnavailableMetric label="CPC unavailable" />
        ),
      header: "CPC",
      id: "cpcCents",
      meta: { align: "end", sortable: false, title: "Cost per click" },
      minSize: 80,
      size: 80,
    },
    {
      cell: ({ row }) => <IntentChip intent={row.original.intent} />,
      header: "Intent",
      id: "intent",
      meta: { sortable: false, title: "Intent" },
      minSize: 96,
      size: 96,
    },
    {
      cell: ({ row }) => (
        <code className="rounded bg-bg-sunken px-2 py-1 text-[10.5px] text-fg-muted">
          {row.original.source}
        </code>
      ),
      header: "Source",
      id: "source",
      meta: { sortable: false, title: "Source" },
      minSize: 104,
      size: 104,
    },
  ];
}
