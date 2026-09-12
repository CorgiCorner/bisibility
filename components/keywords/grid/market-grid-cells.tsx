import { Tooltip } from "@/components/ui/Tooltip";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import * as rankDepth from "@/lib/serp/rank-depth";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/csr/ClockCountdown";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import Link from "next/link";
import { rankTrackerKeywordLinkClassName } from "./keyword-link-styles";

const noDataClassName = "font-sans tabular-nums text-xs font-semibold text-fg-muted";

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
    <Tooltip content={label}>
      <span aria-label={label} className={[noDataClassName, className].join(" ")}>
        -
      </span>
    </Tooltip>
  );
}

export function MarketKeywordCell({
  projectRef,
  row,
}: Readonly<{ projectRef: string; row: KeywordRow }>) {
  const parent = marketGridParent(row);
  if (parent) {
    const marketCount = new Set(
      parent.aggregate.children.map((child) => child.location.canonicalKey),
    ).size;
    return (
      <span className="flex w-full min-w-0 items-center">
        <span className="min-w-0 flex-1">
          <Tooltip content={row.keyword} wrapperClassName="w-full min-w-0">
            <span className="bv-keyword-title block w-full truncate text-[13.5px] font-semibold text-fg group-hover:text-accent-text group-hover:underline">
              {row.keyword}
            </span>
          </Tooltip>
          <span className="block font-sans tabular-nums text-[10.5px] text-fg-muted">
            {marketCount} {marketCount === 1 ? "market" : "markets"} /{" "}
            {parent.aggregate.activeTargetCount} active targets
          </span>
        </span>
      </span>
    );
  }
  return (
    <Tooltip content={row.keyword} wrapperClassName="w-full min-w-0">
      <Link
        className={`bv-keyword-title block w-full min-w-0 truncate text-[13.5px] ${rankTrackerKeywordLinkClassName} group-hover:text-accent-text group-hover:underline`}
        href={appPath(projectRef, "rank-tracker", row.id)}
        onClick={(event) => event.stopPropagation()}
      >
        {row.keyword}
      </Link>
    </Tooltip>
  );
}

export function MarketPositionCell({ row }: Readonly<{ row: KeywordRow }>) {
  const parent = marketGridParent(row);
  if (!row.hasRankData) return <NoDataValue className="text-[13px]" label={noRankLabel(row)} />;
  if (rankDepth.isPositionOutsideTrackedDepth(row.position, row.trackedDepth))
    return <span>{`Not found in top ${row.trackedDepth ?? 100}`}</span>;

  const value = (
    <span className="font-sans tabular-nums text-[13.5px] font-semibold text-fg">
      #{row.position}
    </span>
  );
  return parent ? (
    <Tooltip content={`Best position across ${parent.aggregate.activeTargetCount} active targets`}>
      <span className="inline-flex items-center gap-1.5">
        {value}
        {parent.aggregate.stale ? (
          <ClockCountdown
            weight="regular"
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

export function MarketLocationCell({ row }: Readonly<{ row: KeywordRow }>) {
  const parent = marketGridParent(row);
  const isCity = row.location.kind === "city";
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <MapPin
        className={isCity ? "flex-none text-accent-text" : "flex-none text-fg-muted"}
        size={13}
        weight="regular"
      />
      <span className="truncate text-[12.5px] text-fg-muted">
        <span>{row.location.displayName}</span>
        {parent ? null : <span>{` / ${row.location.languageLabel ?? row.location.hl}`}</span>}
      </span>
    </span>
  );
}

export function MarketVolumeCell({ row }: Readonly<{ row: KeywordRow }>) {
  const parent = marketGridParent(row);
  if (parent?.aggregate.volume === null) return <NoDataValue label="No supported volume pairs" />;
  if (!parent && row.volumeKnown === false)
    return <NoDataValue label="No volume data for this market-language pair" />;
  return (
    <Tooltip
      content={
        parent
          ? "Sum over unique market-language pairs, never devices"
          : "Search volume for this market-language pair"
      }
    >
      <span>
        <span>
          {formatVolume(row.volume)}
          {parent?.aggregate.hasPartiallyUnsupportedVolume ? "+" : ""}
        </span>
      </span>
    </Tooltip>
  );
}

export function MarketDifficultyCell({ row }: Readonly<{ row: KeywordRow }>) {
  const parent = marketGridParent(row);
  if (parent?.aggregate.difficulty === "mixed") return <span>mixed</span>;
  if (row.difficultyKnown === false) return <NoDataValue label="No difficulty data" />;
  return <span>{row.difficulty}</span>;
}
