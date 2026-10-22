import { StatusPill } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import { hasUrlMismatch } from "@/lib/alerts/url-mismatch";
import { marketGridParent } from "@/lib/keywords/market-grid-model";
import { pathFromUrl } from "@/lib/queries/keyword-row-format";
import type { KeywordRow } from "@/lib/queries/keywords";
import { hasIncompleteObservation } from "@/lib/serp/rank-depth";
import { useFormatter, useTranslations } from "next-intl";
import { KeywordCellHelp } from "./KeywordCellHelp";
import { keywordRankView } from "./keyword-rank-quality-view";

type TargetRankingCellProps = {
  row: KeywordRow;
  compact?: boolean;
};

function UrlPath({ value, detail }: Readonly<{ value: string; detail?: string }>) {
  return (
    <KeywordCellHelp
      description={detail ?? value}
      className="font-sans tabular-nums text-[11.5px] text-fg-muted"
    >
      {pathFromUrl(value)}
    </KeywordCellHelp>
  );
}

function MatchStatus({ row }: Readonly<{ row: KeywordRow }>) {
  const view = keywordRankView(row);
  if (view.isGroup || view.currentPosition === null) return null;
  const expectedUrl = view.quality ? row.expectedUrl : (row.expectedUrl ?? row.targetUrl);
  if (!expectedUrl || !row.rankingUrl) return null;
  const mismatch = hasUrlMismatch({
    position: view.currentPosition,
    rankingUrl: row.rankingUrl,
    targetUrl: expectedUrl,
  });
  return (
    <span className="shrink-0 self-center">
      <StatusPill status={mismatch ? "wrong_url" : "matches"} size="sm" />
    </span>
  );
}

export function TargetRankingCell({ row, compact = false }: Readonly<TargetRankingCellProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  const format = useFormatter();
  const qualityT = useTranslations("projectRankTracker.keywordImport.management.grid.quality");
  const view = keywordRankView(row);
  const parent = marketGridParent(row);
  if (parent) {
    return (
      <Tooltip content={parent.aggregate.rankingUrls.join("\n")}>
        <span className="font-sans tabular-nums text-[11.5px] text-fg-muted">
          {qualityT("groupRankingUrls", {
            count: format.number(parent.aggregate.rankingUrls.length),
          })}
        </span>
      </Tooltip>
    );
  }
  const rankingUrl =
    view.quality?.current?.rankingUrl ?? view.lastKnown?.rankingUrl ?? row.rankingUrl;
  const rankingLabel = rankingUrl
    ? pathFromUrl(rankingUrl)
    : row.checkState === "never_checked"
      ? t("notCheckedYet")
      : hasIncompleteObservation(row.observationCompleteness)
        ? t("coverageUnknown")
        : t("notFound");
  // Qualified rows carry the expectation captured by that check, never today's editable target.
  const expectedUrl = view.quality ? row.expectedUrl : (row.expectedUrl ?? row.targetUrl);

  const expectedDetail = expectedUrl
    ? [
        expectedUrl,
        row.expectedUrlFallbackCurrent
          ? t("expectedCurrentTarget")
          : view.quality
            ? qualityT("capturedExpectedUrl")
            : qualityT("expectedUrlProvenanceUnknown"),
      ].join("\n")
    : undefined;
  const retained = rankingUrl && view.currentPosition === null;
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 py-1 text-[11.5px] leading-tight">
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[48px] shrink-0 font-sans tabular-nums text-[9.5px] uppercase text-fg-muted">
            {t("target")}
          </span>
          {expectedUrl ? (
            <span className="min-w-0">
              <UrlPath value={expectedUrl} detail={compact ? expectedDetail : undefined} />
              <span className="sr-only">
                {t("expectedForMarket", { path: pathFromUrl(expectedUrl) })}
              </span>
            </span>
          ) : (
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">{t("notSet")}</span>
          )}
        </div>
        {expectedUrl && !compact ? (
          <span className="block truncate text-[10.5px] text-fg-muted">
            {row.expectedUrlFallbackCurrent
              ? t("expectedCurrentTarget")
              : view.quality
                ? qualityT("capturedExpectedUrl")
                : qualityT("expectedUrlProvenanceUnknown")}
          </span>
        ) : null}
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[48px] shrink-0 font-sans tabular-nums text-[9.5px] uppercase text-fg-muted">
            {compact && retained ? qualityT("retainedUrlShort") : t("ranking")}
          </span>
          {rankingUrl ? (
            <Tooltip
              content={[retained ? qualityT("retainedRankingUrl") : t("ranking"), rankingUrl].join(
                "\n",
              )}
              semantics="description"
              wrapperClassName="min-w-0"
            >
              <a
                className="min-w-0 truncate font-sans tabular-nums text-[11.5px] text-fg-muted hover:text-accent-text hover:underline"
                href={rankingUrl}
                onClick={(event) => event.stopPropagation()}
                rel="noreferrer noopener"
                target="_blank"
              >
                {rankingLabel}
              </a>
            </Tooltip>
          ) : (
            <span className="font-sans tabular-nums text-[11px] text-fg-muted">{rankingLabel}</span>
          )}
        </div>
        {rankingUrl && view.currentPosition === null && !compact ? (
          <span className="block truncate text-[10.5px] text-fg-muted">
            {qualityT("retainedRankingUrl")}
          </span>
        ) : null}
      </div>
      <MatchStatus row={row} />
    </div>
  );
}
