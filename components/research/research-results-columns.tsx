import { Sparkline } from "@/components/charts/Sparkline";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import type { GridColDef } from "@mui/x-data-grid";
import { ResearchKeywordCell } from "./ResearchKeywordCell";
import { ResearchUnavailableMetric } from "./ResearchUnavailableMetric";
import { chronologicalTrend, difficultyPillStyle, IntentChip } from "./research-results-model";

export function researchResultsColumns(input: {
  canRemoveSaved: boolean;
  metricsAvailable: boolean;
  onToggleSave: (row: GroupedResearchRow) => void;
}): GridColDef<GroupedResearchRow>[] {
  return [
    {
      field: "keyword",
      flex: 1.5,
      headerName: "Keyword",
      minWidth: 210,
      renderCell: ({ row }) => (
        <ResearchKeywordCell
          canRemoveSaved={input.canRemoveSaved}
          onToggleSave={input.onToggleSave}
          row={row}
        />
      ),
      sortable: false,
    },
    {
      field: "searchVolume",
      headerName: "Volume",
      minWidth: 92,
      renderCell: ({ row }) =>
        input.metricsAvailable ? (
          <span className="font-mono text-[12px]">
            {row.searchVolume == null ? "-" : row.searchVolume.toLocaleString("en-US")}
          </span>
        ) : (
          <ResearchUnavailableMetric label="Search volume unavailable" />
        ),
    },
    {
      field: "trend",
      headerName: "Trend",
      minWidth: 102,
      renderCell: ({ row }) =>
        input.metricsAvailable ? (
          <Sparkline
            ariaLabel={`Monthly volume trend for ${row.keyword}`}
            data={chronologicalTrend(row.monthlyTrend).map((point) => point.searchVolume)}
          />
        ) : (
          <ResearchUnavailableMetric label="Search trend unavailable" />
        ),
      sortable: false,
    },
    {
      field: "difficulty",
      headerName: "KD",
      minWidth: 68,
      renderCell: ({ row }) =>
        input.metricsAvailable ? (
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold"
            style={difficultyPillStyle(row.difficulty)}
          >
            {row.difficulty ?? "-"}
          </span>
        ) : (
          <ResearchUnavailableMetric label="KD unavailable" />
        ),
      sortable: false,
    },
    {
      field: "cpcCents",
      headerName: "CPC",
      minWidth: 78,
      renderCell: ({ row }) =>
        input.metricsAvailable ? (
          <span className="font-mono text-[11.5px]">
            {row.cpcCents == null ? "-" : formatEstimateCents(row.cpcCents)}
          </span>
        ) : (
          <ResearchUnavailableMetric label="CPC unavailable" />
        ),
      sortable: false,
    },
    {
      field: "intent",
      headerName: "Intent",
      minWidth: 96,
      renderCell: ({ row }) => <IntentChip intent={row.intent} />,
      sortable: false,
    },
    {
      field: "source",
      headerName: "Source",
      minWidth: 104,
      renderCell: ({ row }) => (
        <code className="rounded bg-bg-sunken px-2 py-1 text-[10.5px] text-fg-muted">
          {row.source}
        </code>
      ),
      sortable: false,
    },
  ];
}
