import { Sparkline } from "@/components/charts/Sparkline";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { type ScheduleReference, scheduleRowLabel } from "@/lib/schedules/mixed-state";
import * as rankDepth from "@/lib/serp/rank-depth";
import { frequencyOptions } from "@/lib/settings/options";
import { chartColors } from "@/lib/theme/chart-colors";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
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
import { ScheduleCell, type ScheduleCellTarget } from "./ScheduleCell";
import { TargetRankingCell } from "./TargetRankingCell";

type ScheduledKeywordRow = KeywordRow & { checkSchedule?: ScheduleReference | null };

function fallbackSchedule(row: KeywordRow): ScheduleReference | null {
  if (row.schedule.frequency === "manual") return null;
  const name = frequencyOptions.find((option) => option.value === row.schedule.frequency)?.label;
  return name ? { name, publicId: `legacy:${row.schedule.frequency}` } : null;
}

function scheduleTarget(row: KeywordRow): ScheduleCellTarget {
  return {
    device: row.device,
    id: row.id,
    location: `${row.location.displayName} / ${row.location.languageLabel ?? row.location.hl}`,
    schedule: (row as ScheduledKeywordRow).checkSchedule ?? fallbackSchedule(row),
  };
}

export function scheduleTargetsForRow(row: KeywordRow): ScheduleCellTarget[] {
  const parent = marketGridParent(row);
  return (parent?.aggregate.children ?? [row]).map(scheduleTarget);
}

function DeviceCell({ row }: Readonly<{ row: KeywordRow }>) {
  const Icon = row.device.toLowerCase() === "mobile" ? DeviceMobile : Monitor;
  return (
    <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap font-sans tabular-nums text-[11px] leading-none text-fg-muted">
      {!marketGridParent(row) ? (
        <Icon aria-hidden className="shrink-0" size={13} weight="regular" />
      ) : null}
      <span className="truncate">{row.device}</span>
    </span>
  );
}

function SparklineCell({ row }: Readonly<{ row: KeywordRow }>) {
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

export function TagsCell({ row }: Readonly<{ row: KeywordRow }>) {
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
): DataTableColumn<KeywordRow>[] {
  return [
    {
      accessorFn: (row) => row.keyword,
      cell: ({ row }) => <MarketKeywordCell projectRef={projectRef} row={row.original} />,
      header: "Keyword",
      id: "keyword",
      meta: { flex: 1.55, lockVisible: true, pin: "left", title: "Keyword" },
      minSize: 160,
      size: 300,
    },
    {
      accessorFn: (row) => row.position,
      cell: ({ row }) => <MarketPositionCell row={row.original} />,
      header: "Pos",
      id: "position",
      meta: { align: "end", title: "Position" },
      minSize: 172,
      size: 172,
    },
    {
      accessorFn: (row) =>
        rankDepth.hasTrackedPosition(row) && row.positionBaseline !== null
          ? row.positionBaseline - row.position
          : null,
      cell: ({ row }) =>
        rankDepth.hasTrackedPosition(row.original) ? (
          <KeywordChangeCell row={row.original} />
        ) : (
          <NoDataValue label={noRankLabel(row.original)} />
        ),
      header: "Change",
      id: "change",
      meta: { align: "end", title: "Change" },
      minSize: 92,
      size: 92,
    },
    {
      accessorFn: (row) => row.location.displayName,
      cell: ({ row }) => <MarketLocationCell row={row.original} />,
      header: "Location",
      id: "location",
      meta: { flex: 0.9, title: "Location" },
      minSize: 152,
      size: 152,
    },
    {
      accessorFn: (row) => row.device,
      cell: ({ row }) => <DeviceCell row={row.original} />,
      header: "Device",
      id: "device",
      meta: { lockResize: true, sortable: ({ grouped }) => !grouped, title: "Device" },
      maxSize: 84,
      minSize: 84,
      size: 84,
    },
    {
      accessorFn: (row) => row.volume,
      cell: ({ row }) => <MarketVolumeCell row={row.original} />,
      header: "Volume",
      id: "volume",
      meta: { align: "end", title: "Volume" },
      minSize: 96,
      size: 96,
      sortDescFirst: true,
    },
    {
      accessorFn: (row) =>
        marketGridParent(row)?.aggregate.difficulty === "mixed" ? null : row.difficulty,
      cell: ({ row }) => <MarketDifficultyCell row={row.original} />,
      header: "Difficulty",
      id: "difficulty",
      meta: { align: "end", title: "Difficulty" },
      minSize: 104,
      size: 104,
    },
    {
      accessorFn: (row) =>
        rankDepth.hasTrackedPosition(row) ? (row.sparkline.at(-1) ?? null) : null,
      cell: ({ row }) => <SparklineCell row={row.original} />,
      header: "12-wk",
      id: "sparkline",
      meta: { title: "12-wk trend" },
      minSize: 120,
      size: 120,
    },
    ...trafficColumns,
    {
      accessorFn: (row) => row.lastCheckAt,
      cell: ({ row }) => (
        <LastCheckedCell
          lastCheckAt={row.original.lastCheckAt}
          status={pendingCheckIds.has(row.original.id) ? "running" : row.original.lastCheckStatus}
        />
      ),
      header: "Last checked",
      id: "lastChecked",
      meta: { title: "Last checked" },
      minSize: 152,
      size: 152,
    },
    {
      accessorFn: (row) => scheduleRowLabel(scheduleTargetsForRow(row)),
      cell: ({ row }) => <ScheduleCell targets={scheduleTargetsForRow(row.original)} />,
      header: "Schedule",
      id: "frequency",
      meta: { title: "Schedule" },
      minSize: 148,
      size: 148,
    },
    {
      accessorFn: (row) => [row.targetUrl, row.rankingUrl].filter(Boolean).join(" "),
      cell: ({ row }) => <TargetRankingCell row={row.original} />,
      header: "Target and ranking",
      id: "targetRanking",
      meta: { flex: 1.35, title: "Target and ranking" },
      minSize: 300,
      size: 300,
    },
    {
      accessorFn: (row) => row.tags.join(", "),
      cell: ({ row }) => <TagsCell row={row.original} />,
      header: "Tags",
      id: "tags",
      meta: { flex: 0.9, title: "Tags" },
      minSize: 172,
      size: 172,
    },
    {
      accessorFn: (row) => row.topic,
      cell: ({ row }) => <MetadataChip value={row.original.topic} />,
      header: "Topic",
      id: "topic",
      meta: { title: "Topic" },
      minSize: 132,
      size: 132,
    },
    {
      accessorFn: (row) => row.intent,
      cell: ({ row }) => <MetadataChip value={row.original.intent} />,
      header: "Intent",
      id: "intent",
      meta: { title: "Intent" },
      minSize: 132,
      size: 132,
    },
    rowActionsColumn(actions, projectRef, pendingCheckIds),
  ];
}

export { MarketKeywordCell as KeywordCell, MarketLocationCell as LocationCell };
