import { Tooltip } from "@/components/ui/Tooltip";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import * as rankDepth from "@/lib/serp/rank-depth";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/csr/ClockCountdown";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { rankTrackerKeywordLinkClassName } from "./keyword-link-styles";

const noDataClassName = "font-sans tabular-nums text-xs font-semibold text-fg-muted";

type MarketCellsTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.marketCells">
>;

export function noRankLabel(row: KeywordRow, t: MarketCellsTranslations) {
  const state = row.checkState ?? row.lastCheckStatus;
  if (state === "running") return t("checkRunning");
  if (state === "failed") return t("latestCheckFailed");
  if (state === "not_ranked" || state === "completed")
    return t("notRanked", { depth: row.trackedDepth ?? 100 });
  return t("awaitingFirstCheck");
}

export function NoDataValue({
  className,
  label,
}: Readonly<{ className?: string; label?: string }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  const accessibleLabel = label ?? t("noData");
  return (
    <Tooltip content={accessibleLabel}>
      <span aria-label={accessibleLabel} className={[noDataClassName, className].join(" ")}>
        -
      </span>
    </Tooltip>
  );
}

export function MarketKeywordCell({
  projectRef,
  row,
}: Readonly<{ projectRef: string; row: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.marketCells");
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
            {t("marketSummary", {
              markets: marketCount,
              targets: parent.aggregate.activeTargetCount,
            })}
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
  const t = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  const parent = marketGridParent(row);
  if (!row.hasRankData) return <NoDataValue className="text-[13px]" label={noRankLabel(row, t)} />;
  if (rankDepth.isPositionOutsideTrackedDepth(row.position, row.trackedDepth))
    return <span>{t("notFoundInTop", { depth: row.trackedDepth ?? 100 })}</span>;

  const value = (
    <span className="font-sans tabular-nums text-[13.5px] font-semibold text-fg">
      {t("position", { position: row.position })}
    </span>
  );
  return parent ? (
    <Tooltip content={t("bestPosition", { count: parent.aggregate.activeTargetCount })}>
      <span className="inline-flex items-center gap-1.5">
        {value}
        {parent.aggregate.stale ? (
          <ClockCountdown
            weight="regular"
            aria-label={t("includesStaleTarget")}
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
  const format = useFormatter();
  const t = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  const parent = marketGridParent(row);
  if (parent?.aggregate.volume === null) return <NoDataValue label={t("noSupportedVolumePairs")} />;
  if (!parent && row.volumeKnown === false) return <NoDataValue label={t("noVolumeDataForPair")} />;
  return (
    <Tooltip content={parent ? t("aggregateVolumeHelp") : t("pairVolumeHelp")}>
      <span>
        <span>
          {format.number(row.volume, { maximumFractionDigits: 1, notation: "compact" })}
          {parent?.aggregate.hasPartiallyUnsupportedVolume ? "+" : ""}
        </span>
      </span>
    </Tooltip>
  );
}

export function MarketDifficultyCell({ row }: Readonly<{ row: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.marketCells");
  const parent = marketGridParent(row);
  if (parent?.aggregate.difficulty === "mixed") return <span>{t("mixed")}</span>;
  if (row.difficultyKnown === false) return <NoDataValue label={t("noDifficultyData")} />;
  return <span>{row.difficulty}</span>;
}
