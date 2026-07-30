import { Sparkline } from "@/components/charts/Sparkline";
import { MonoText } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import * as rankDepth from "@/lib/serp/rank-depth";
import { chartColors } from "@/lib/theme/chart-colors";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import {
  EyeIcon as Eye,
  MapPinIcon as MapPin,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import Link from "next/link";
import { FrequencyCell } from "./FrequencyCell";
import { trafficColumns } from "./grid-columns-traffic";
import { KeywordChangeCell } from "./KeywordChangeCell";
import type { KeywordColumnActions } from "./keyword-column-actions";
import { LastCheckedCell } from "./LastCheckedCell";
import { rowActionsColumn } from "./RowActionsCell";
import { TargetRankingCell } from "./TargetRankingCell";

const noDataClassName = "font-mono text-xs font-semibold text-fg-faint";

function formatVolume(volume: number) {
  if (volume >= 10000) {
    return `${(volume / 1000).toFixed(0)}k`;
  }
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k`;
  }
  return String(volume);
}

function noRankLabel(row: KeywordRow) {
  const state = row.checkState ?? row.lastCheckStatus;
  if (state === "running") return "Check running";
  if (state === "failed") return "Latest check failed";
  if (state === "not_ranked" || state === "completed")
    return rankDepth.notRankedLabel(row.trackedDepth);
  return "Awaiting first check";
}

function NoDataValue({
  className,
  label = "No data",
}: Readonly<{ className?: string; label?: string }>) {
  return (
    <Tooltip title={label}>
      <span aria-label={label} className={[noDataClassName, className].join(" ")}>
        -
      </span>
    </Tooltip>
  );
}

export function KeywordCell({
  projectRef,
  row,
}: Readonly<Pick<GridRenderCellParams<KeywordRow>, "row"> & { projectRef: string }>) {
  return (
    <span className="flex w-full min-w-0 items-center gap-1">
      <Tooltip title="View keyword details">
        <IconButton
          aria-label="View keyword details"
          className="h-7 min-h-0 w-7 min-w-0 shrink-0"
          component={Link}
          href={appPath(projectRef, "keywords", row.id)}
          onClick={(event) => event.stopPropagation()}
          size="small"
          sx={{
            color: "var(--fg-muted)",
            "&:hover": { backgroundColor: "var(--accent-soft)", color: "var(--accent)" },
          }}
        >
          <Eye size={14} />
        </IconButton>
      </Tooltip>
      <span
        className="bv-keyword-title min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg"
        style={{ lineHeight: "18px" }}
      >
        {row.keyword}
      </span>
    </span>
  );
}

function PositionCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  if (!row.hasRankData) {
    return <NoDataValue className="text-[13px]" label={noRankLabel(row)} />;
  }
  if (rankDepth.isPositionOutsideTrackedDepth(row.position, row.trackedDepth))
    return <span>{`Not found in top ${row.trackedDepth ?? 100}`}</span>;

  return <span className="font-mono text-[13.5px] font-semibold text-fg">#{row.position}</span>;
}

function DeviceCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-bg-sunken px-2.5 py-1 font-mono text-[11px] leading-none text-fg-muted">
      <Monitor className="text-fg-faint" size={13} />
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

export function LocationCell({ row }: Readonly<Pick<GridRenderCellParams<KeywordRow>, "row">>) {
  const isCity = row.location.kind === "city";
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <MapPin
        className={isCity ? "flex-none text-accent" : "flex-none text-fg-faint"}
        size={13}
        weight={isCity ? "fill" : "regular"}
      />
      <span className="truncate text-[12.5px] text-fg-muted">{row.location.displayName}</span>
    </span>
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
      renderCell: ({ row }) => <KeywordCell projectRef={projectRef} row={row} />,
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
      renderCell: PositionCell,
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
      renderCell: ({ row }) => (
        <MonoText component="span" size="lg">
          {formatVolume(row.volume)}
        </MonoText>
      ),
      type: "number",
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
      renderCell: LocationCell,
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
