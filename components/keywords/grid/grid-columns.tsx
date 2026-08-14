import { Sparkline } from "@/components/charts/Sparkline";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import * as rankDepth from "@/lib/serp/rank-depth";
import { chartColors } from "@/lib/theme/chart-colors";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { MonitorIcon as Monitor } from "@phosphor-icons/react";
import { FrequencyCell } from "./FrequencyCell";
import { trafficColumns } from "./grid-columns-traffic";
import { KeywordChangeCell } from "./KeywordChangeCell";
import type { KeywordColumnActions } from "./keyword-column-actions";
import { LastCheckedCell } from "./LastCheckedCell";
import {
  MarketDifficultyCell,
  MarketKeywordCell,
  MarketLocationCell,
  MarketPositionCell,
  MarketVolumeCell,
  NoDataValue,
  noRankLabel,
} from "./market-grid-cells";
import { rowActionsColumn } from "./RowActionsCell";
import { TargetRankingCell } from "./TargetRankingCell";

function DeviceCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-bg-sunken px-2.5 py-1 font-mono text-[11px] leading-none text-fg-muted">
      <Monitor className="text-fg-muted" size={13} />
      {row.device}
    </span>
  );
}

function SparklineCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  if (!rankDepth.hasTrackedPosition(row)) {
    return <NoDataValue className="block w-[92px]" label={noRankLabel(row)} />;
  }

  const color =
    row.positionBaseline === null
      ? chartColors.accent
      : row.positionBaseline >= row.position
        ? chartColors.green
        : chartColors.red;
  return (
    <Sparkline
      ariaLabel={`Position trend for ${row.keyword}`}
      color={color}
      data={row.sparkline}
      valueFormatter={(value) => (value ? `#${value}` : "")}
    />
  );
}

export function TagsCell({ row }: Readonly<Pick<GridRenderCellParams<KeywordRow>, "row">>) {
  return (
    <span className="flex h-full min-w-0 items-center gap-[5px] overflow-hidden py-1">
      {row.tags.map((tag) => (
        <span
          className="inline-flex h-5 flex-none self-center items-center whitespace-nowrap rounded-full border border-border bg-bg-sunken px-2 text-[9.5px] font-semibold leading-none text-fg-muted"
          key={tag}
        >
          {tag}
        </span>
      ))}
    </span>
  );
}

function MetadataChip({ value }: Readonly<{ value: string | null }>) {
  if (!value) {
    return <NoDataValue />;
  }
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full border border-border bg-bg-sunken px-2 py-[3px] text-[11px] leading-none text-fg-muted">
      {value}
    </span>
  );
}

export function keywordColumns(
  actions: KeywordColumnActions,
  projectRef: string,
  pendingCheckIds: ReadonlySet<string> = new Set(),
): GridColDef<KeywordRow>[] {
  return [
    {
      field: "keyword",
      headerName: "Keyword",
      flex: 1.55,
      minWidth: 210,
      renderCell: ({ row }) => <MarketKeywordCell projectRef={projectRef} row={row} />,
    },
    {
      field: "device",
      headerName: "Device",
      minWidth: 118,
      renderCell: DeviceCell,
      valueGetter: (_value, row) => row.device,
    },
    {
      field: "position",
      headerName: "Pos",
      minWidth: 170,
      renderCell: MarketPositionCell,
      type: "number",
    },
    {
      field: "change",
      headerName: "Change",
      minWidth: 92,
      renderCell: ({ row }) =>
        rankDepth.hasTrackedPosition(row) ? (
          <KeywordChangeCell row={row} />
        ) : (
          <NoDataValue label={noRankLabel(row)} />
        ),
      valueGetter: (_value, row) =>
        rankDepth.hasTrackedPosition(row) && row.positionBaseline !== null
          ? row.positionBaseline - row.position
          : null,
    },
    {
      field: "volume",
      headerName: "Volume",
      minWidth: 96,
      renderCell: MarketVolumeCell,
      type: "number",
    },
    {
      field: "difficulty",
      headerName: "Difficulty",
      minWidth: 104,
      renderCell: MarketDifficultyCell,
      type: "number",
      valueGetter: (_value, row) =>
        marketGridParent(row)?.aggregate.difficulty === "mixed" ? null : row.difficulty,
    },
    {
      field: "sparkline",
      headerName: "12-wk",
      minWidth: 120,
      renderCell: SparklineCell,
      sortable: true,
      valueGetter: (_value, row) =>
        rankDepth.hasTrackedPosition(row) ? (row.sparkline.at(-1) ?? null) : null,
    },
    ...trafficColumns,
    {
      field: "lastChecked",
      headerName: "Last checked",
      minWidth: 152,
      renderCell: ({ row }) => (
        <LastCheckedCell
          lastCheckAt={row.lastCheckAt}
          status={pendingCheckIds.has(row.id) ? "running" : row.lastCheckStatus}
        />
      ),
      sortable: true,
      valueGetter: (_value, row) => row.lastCheckAt,
    },
    {
      field: "frequency",
      headerName: "Frequency",
      minWidth: 148,
      renderCell: FrequencyCell,
      valueGetter: (_value, row) => row.schedule.frequency,
    },
    {
      field: "location",
      headerName: "Location",
      flex: 0.9,
      minWidth: 150,
      renderCell: MarketLocationCell,
      valueGetter: (_value, row) => row.location.displayName,
    },
    {
      field: "targetRanking",
      headerName: "Target & ranking",
      flex: 1.35,
      minWidth: 300,
      renderCell: ({ row }) => <TargetRankingCell row={row} />,
      valueGetter: (_value, row) => [row.targetUrl, row.rankingUrl].filter(Boolean).join(" "),
    },
    {
      field: "tags",
      headerName: "Tags",
      flex: 0.9,
      minWidth: 170,
      renderCell: TagsCell,
      valueGetter: (_value, row) => row.tags.join(", "),
    },
    {
      field: "topic",
      headerName: "Topic",
      minWidth: 130,
      renderCell: ({ row }) => <MetadataChip value={row.topic} />,
      valueGetter: (_value, row) => row.topic,
    },
    {
      field: "intent",
      headerName: "Intent",
      minWidth: 130,
      renderCell: ({ row }) => <MetadataChip value={row.intent} />,
      valueGetter: (_value, row) => row.intent,
    },
    rowActionsColumn(actions, projectRef, pendingCheckIds),
  ];
}

export { MarketKeywordCell as KeywordCell, MarketLocationCell as LocationCell };
