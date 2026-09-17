import { Sparkline } from "@/components/charts/Sparkline";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { type ScheduleReference, scheduleRowSortValue } from "@/lib/schedules/mixed-state";
import * as rankDepth from "@/lib/serp/rank-depth";
import { frequencyOptions } from "@/lib/settings/options";
import { chartColors } from "@/lib/theme/chart-colors";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { MonitorIcon as Monitor } from "@phosphor-icons/react/dist/csr/Monitor";
import { type TrafficColumnLabels, trafficColumns } from "./grid-columns-traffic";
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
} from "./market-grid-cells";
import { rowActionsColumn } from "./RowActionsCell";
import { ScheduleCell, type ScheduleCellTarget } from "./ScheduleCell";
import { TargetRankingCell } from "./TargetRankingCell";

type ScheduledKeywordRow = KeywordRow & { checkSchedule?: ScheduleReference | null };

export type KeywordColumnLabels = TrafficColumnLabels & {
  change: string;
  device: string;
  difficulty: string;
  keyword: string;
  lastChecked: string;
  location: string;
  noRankLabel: (row: KeywordRow) => string;
  formatPosition: (value: number) => string;
  position: string;
  positionShort: string;
  positionTrend: (values: { keyword: string }) => string;
  schedule: string;
  targetAndRanking: string;
  tags: string;
  topic: string;
  trend: string;
  trendTitle: string;
  intent: string;
  volume: string;
};

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

function SparklineCell({
  formatPosition,
  noRankLabel,
  positionTrend,
  row,
}: Readonly<{
  formatPosition: (value: number) => string;
  noRankLabel: (row: KeywordRow) => string;
  positionTrend: string;
  row: KeywordRow;
}>) {
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
      ariaLabel={positionTrend}
      color={color}
      data={row.sparkline}
      valueFormatter={(value) => (value ? formatPosition(value) : "")}
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
  labels: KeywordColumnLabels,
): DataTableColumn<KeywordRow>[] {
  return [
    {
      accessorFn: (row) => row.keyword,
      cell: ({ row }) => <MarketKeywordCell projectRef={projectRef} row={row.original} />,
      header: labels.keyword,
      id: "keyword",
      meta: { flex: 1.55, lockVisible: true, pin: "left", title: labels.keyword },
      minSize: 160,
      size: 300,
    },
    {
      accessorFn: (row) => row.position,
      cell: ({ row }) => <MarketPositionCell row={row.original} />,
      header: labels.positionShort,
      id: "position",
      meta: { align: "end", title: labels.position },
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
          <NoDataValue label={labels.noRankLabel(row.original)} />
        ),
      header: labels.change,
      id: "change",
      meta: { align: "end", title: labels.change },
      minSize: 92,
      size: 92,
    },
    {
      accessorFn: (row) => row.location.displayName,
      cell: ({ row }) => <MarketLocationCell row={row.original} />,
      header: labels.location,
      id: "location",
      meta: { flex: 0.9, title: labels.location },
      minSize: 152,
      size: 152,
    },
    {
      accessorFn: (row) => row.device,
      cell: ({ row }) => <DeviceCell row={row.original} />,
      header: labels.device,
      id: "device",
      meta: { lockResize: true, sortable: ({ grouped }) => !grouped, title: labels.device },
      maxSize: 84,
      minSize: 84,
      size: 84,
    },
    {
      accessorFn: (row) => row.volume,
      cell: ({ row }) => <MarketVolumeCell row={row.original} />,
      header: labels.volume,
      id: "volume",
      meta: { align: "end", title: labels.volume },
      minSize: 96,
      size: 96,
      sortDescFirst: true,
    },
    {
      accessorFn: (row) =>
        marketGridParent(row)?.aggregate.difficulty === "mixed" ? null : row.difficulty,
      cell: ({ row }) => <MarketDifficultyCell row={row.original} />,
      header: labels.difficulty,
      id: "difficulty",
      meta: { align: "end", title: labels.difficulty },
      minSize: 104,
      size: 104,
    },
    {
      accessorFn: (row) =>
        rankDepth.hasTrackedPosition(row) ? (row.sparkline.at(-1) ?? null) : null,
      cell: ({ row }) => (
        <SparklineCell
          formatPosition={labels.formatPosition}
          noRankLabel={labels.noRankLabel}
          positionTrend={labels.positionTrend({ keyword: row.original.keyword })}
          row={row.original}
        />
      ),
      header: labels.trend,
      id: "sparkline",
      meta: { title: labels.trendTitle },
      minSize: 120,
      size: 120,
    },
    ...trafficColumns(labels),
    {
      accessorFn: (row) => row.lastCheckAt,
      cell: ({ row }) => (
        <LastCheckedCell
          lastCheckAt={row.original.lastCheckAt}
          status={pendingCheckIds.has(row.original.id) ? "running" : row.original.lastCheckStatus}
        />
      ),
      header: labels.lastChecked,
      id: "lastChecked",
      meta: { title: labels.lastChecked },
      minSize: 152,
      size: 152,
    },
    {
      accessorFn: (row) => scheduleRowSortValue(scheduleTargetsForRow(row)),
      cell: ({ row }) => <ScheduleCell targets={scheduleTargetsForRow(row.original)} />,
      header: labels.schedule,
      id: "frequency",
      meta: { title: labels.schedule },
      minSize: 148,
      size: 148,
    },
    {
      accessorFn: (row) => [row.targetUrl, row.rankingUrl].filter(Boolean).join(" "),
      cell: ({ row }) => <TargetRankingCell row={row.original} />,
      header: labels.targetAndRanking,
      id: "targetRanking",
      meta: { flex: 1.35, title: labels.targetAndRanking },
      minSize: 300,
      size: 300,
    },
    {
      accessorFn: (row) => row.tags.join(", "),
      cell: ({ row }) => <TagsCell row={row.original} />,
      header: labels.tags,
      id: "tags",
      meta: { flex: 0.9, title: labels.tags },
      minSize: 172,
      size: 172,
    },
    {
      accessorFn: (row) => row.topic,
      cell: ({ row }) => <MetadataChip value={row.original.topic} />,
      header: labels.topic,
      id: "topic",
      meta: { title: labels.topic },
      minSize: 132,
      size: 132,
    },
    {
      accessorFn: (row) => row.intent,
      cell: ({ row }) => <MetadataChip value={row.original.intent} />,
      header: labels.intent,
      id: "intent",
      meta: { title: labels.intent },
      minSize: 132,
      size: 132,
    },
    rowActionsColumn(actions, projectRef, pendingCheckIds),
  ];
}

export { MarketKeywordCell as KeywordCell, MarketLocationCell as LocationCell };
