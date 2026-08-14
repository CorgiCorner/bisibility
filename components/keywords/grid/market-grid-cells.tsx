import { MonoText } from "@/components/ui";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import * as rankDepth from "@/lib/serp/rank-depth";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import type { GridRenderCellParams } from "@mui/x-data-grid";
import {
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  ClockCountdownIcon as ClockCountdown,
  EyeIcon as Eye,
  MapPinIcon as MapPin,
} from "@phosphor-icons/react";
import Link from "next/link";

const noDataClassName = "font-mono text-xs font-semibold text-fg-muted";

function formatVolume(volume: number) {
  if (volume >= 10000) return `${(volume / 1000).toFixed(0)}k`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k`;
  return String(volume);
}

export function noRankLabel(row: KeywordRow) {
  const state = row.checkState ?? row.lastCheckStatus;
  if (state === "running") return "Check running";
  if (state === "failed") return "Latest check failed";
  if (state === "not_ranked" || state === "completed")
    return rankDepth.notRankedLabel(row.trackedDepth);
  return "Awaiting first check";
}

export function NoDataValue({
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

export function MarketKeywordCell({
  projectRef,
  row,
}: Readonly<Pick<GridRenderCellParams<KeywordRow>, "row"> & { projectRef: string }>) {
  const parent = marketGridParent(row);
  if (parent) {
    const Caret = parent.expanded ? CaretDown : CaretRight;
    const marketCount = new Set(
      parent.aggregate.children.map((child) => child.location.canonicalKey),
    ).size;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Caret aria-hidden className="flex-none text-fg-muted" size={14} weight="bold" />
        <span className="min-w-0">
          <span className="bv-keyword-title block truncate text-[13.5px] font-semibold text-fg">
            {row.keyword}
          </span>
          <span className="block font-mono text-[10.5px] text-fg-muted">
            {marketCount} {marketCount === 1 ? "market" : "markets"} /{" "}
            {parent.aggregate.activeTargetCount} active targets
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex w-full min-w-0 items-center gap-1">
      <Tooltip title="View keyword details">
        <IconButton
          aria-label="View keyword details"
          className="h-7 min-h-0 w-7 min-w-0 shrink-0"
          component={Link}
          href={appPath(projectRef, "rank-tracker", row.id)}
          onClick={(event) => event.stopPropagation()}
          size="small"
          sx={{
            color: "var(--fg-muted)",
            "&:hover": { backgroundColor: "var(--accent-soft)", color: "var(--accent-text)" },
          }}
        >
          <Eye size={14} />
        </IconButton>
      </Tooltip>
      <span className="bv-keyword-title min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">
        {row.keyword}
      </span>
    </span>
  );
}

export function MarketPositionCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  const parent = marketGridParent(row);
  if (!row.hasRankData) return <NoDataValue className="text-[13px]" label={noRankLabel(row)} />;
  if (rankDepth.isPositionOutsideTrackedDepth(row.position, row.trackedDepth))
    return <span>{`Not found in top ${row.trackedDepth ?? 100}`}</span>;

  const value = (
    <span className="font-mono text-[13.5px] font-semibold text-fg">#{row.position}</span>
  );
  return parent ? (
    <Tooltip title={`Best position across ${parent.aggregate.activeTargetCount} active targets`}>
      <span className="inline-flex items-center gap-1.5">
        {value}
        {parent.aggregate.stale ? (
          <ClockCountdown
            aria-label="Includes a stale target"
            className="text-yellow-text"
            size={14}
          />
        ) : null}
      </span>
    </Tooltip>
  ) : (
    value
  );
}

export function MarketLocationCell({
  row,
}: Readonly<Pick<GridRenderCellParams<KeywordRow>, "row">>) {
  const parent = marketGridParent(row);
  const isCity = row.location.kind === "city";
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <MapPin
        className={isCity ? "flex-none text-accent-text" : "flex-none text-fg-muted"}
        size={13}
        weight={isCity ? "fill" : "regular"}
      />
      <span className="truncate text-[12.5px] text-fg-muted">
        <span>{row.location.displayName}</span>
        {parent ? null : <span>{` / ${row.location.languageLabel ?? row.location.hl}`}</span>}
      </span>
    </span>
  );
}

export function MarketVolumeCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  const parent = marketGridParent(row);
  if (parent?.aggregate.volume === null) return <NoDataValue label="No supported volume pairs" />;
  if (!parent && row.volumeKnown === false)
    return <NoDataValue label="No volume data for this market-language pair" />;
  return (
    <Tooltip
      title={
        parent
          ? "Sum over unique market-language pairs, never devices"
          : "Search volume for this market-language pair"
      }
    >
      <span>
        <MonoText component="span" size="lg">
          {formatVolume(row.volume)}
          {parent?.aggregate.hasPartiallyUnsupportedVolume ? "+" : ""}
        </MonoText>
      </span>
    </Tooltip>
  );
}

export function MarketDifficultyCell({ row }: Readonly<GridRenderCellParams<KeywordRow>>) {
  const parent = marketGridParent(row);
  if (parent?.aggregate.difficulty === "mixed") return <MonoText component="span">mixed</MonoText>;
  if (row.difficultyKnown === false) return <NoDataValue label="No difficulty data" />;
  return <MonoText component="span">{row.difficulty}</MonoText>;
}
