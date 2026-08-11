import { Card } from "@/components/ui";
import {
  deriveKeywordDetailChangeDimensions,
  deriveKeywordDetailWhatChanged,
  describeKeywordDetailPositionChange,
  type KeywordDetailChartState,
  type KeywordDetailKeywordContext,
  type KeywordDetailWhatChanged,
} from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import { hasTrackedPosition, isPositionOutsideTrackedDepth } from "@/lib/serp/rank-depth";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  ArrowUpRightIcon as ArrowUpRight,
  MinusIcon as Minus,
} from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { inferredKeywordContext, KeywordContextRow } from "./KeywordContextRow";

type KeywordMetricCardsProps = {
  chartState?: KeywordDetailChartState;
  keywordContext?: KeywordDetailKeywordContext;
  keyword: KeywordRow;
  whatChanged?: KeywordDetailWhatChanged;
};

type SummaryCardProps = {
  children: ReactNode;
  label: string;
};

const shortDate = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

function SummaryCard({ children, label }: Readonly<SummaryCardProps>) {
  return (
    <Card className="min-h-[148px] rounded-[14px]" size="sm" sx={{ padding: "15px 16px" }}>
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.65px] text-fg-muted">{label}</p>
      <div className="mt-2.5">{children}</div>
    </Card>
  );
}

function compactPath(url: string | null) {
  if (!url) return "No ranking URL";
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not available";
  return shortDate.format(new Date(value));
}

function PositionSummary({
  chartState,
  keyword,
}: Readonly<{ chartState?: KeywordDetailChartState; keyword: KeywordRow }>) {
  const tracked = hasTrackedPosition(keyword);
  const notRanked = keyword.hasRankData && isPositionOutsideTrackedDepth(keyword.position);
  const delta =
    keyword.positionBaseline === null ? null : keyword.positionBaseline - keyword.position;
  const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;
  const deltaColor =
    delta === null || delta === 0
      ? "text-fg-muted"
      : delta > 0
        ? "text-green-text"
        : "text-red-text";

  return (
    <SummaryCard label="Position">
      {tracked ? (
        <div className="flex items-baseline gap-2">
          <span className="text-[27px] font-bold leading-none tracking-[-0.8px]">
            #{keyword.position}
          </span>
          <span
            className={`inline-flex items-center gap-1 font-mono text-[11px] font-semibold ${deltaColor}`}
          >
            <DeltaIcon size={12} weight="bold" />
            {delta === null ? "New" : Math.abs(delta)}
          </span>
        </div>
      ) : (
        <p className="m-0 text-[15px] font-semibold text-fg-muted">
          {notRanked ? `Not in top ${keyword.trackedDepth ?? 100}` : "No data"}
        </p>
      )}
      {tracked ? (
        <div className="mt-2.5 grid gap-1 font-mono text-[11px] text-fg-muted">
          {keyword.positionBaseline !== null ? (
            <span>Previous #{keyword.positionBaseline}</span>
          ) : null}
          {chartState !== "one_check" && keyword.bestPosition !== null ? (
            <span>Best #{keyword.bestPosition} · 30d</span>
          ) : null}
          <span className="pt-1">Tracked since {dateLabel(keyword.createdAt)}</span>
        </div>
      ) : null}
    </SummaryCard>
  );
}

function RankingUrlSummary({ keyword }: Readonly<{ keyword: KeywordRow }>) {
  const firstSeen = keyword.rankingUrlHistory.at(0)?.startAt;
  const matchesTarget = Boolean(keyword.rankingUrl && keyword.rankingUrl === keyword.targetUrl);

  return (
    <SummaryCard label="Ranking URL">
      {keyword.rankingUrl ? (
        <a
          className="flex items-center gap-1.5 font-mono text-[15px] font-semibold text-fg hover:text-accent-text hover:underline"
          href={keyword.rankingUrl}
          rel="noreferrer noopener"
          target="_blank"
          title="Open ranking URL in a new tab"
        >
          <span className="truncate">{compactPath(keyword.rankingUrl)}</span>
          <ArrowUpRight aria-hidden size={13} weight="bold" />
        </a>
      ) : (
        <span className="font-mono text-[15px] font-semibold text-fg-muted">No ranking URL</span>
      )}
      <div className="mt-2.5 grid gap-1 font-mono text-[11px] text-fg-muted">
        {keyword.rankingUrl ? (
          <>
            <span>{matchesTarget ? "Matches target" : "Ranking page differs from target"}</span>
            <span>First seen {dateLabel(firstSeen)}</span>
            <span className="pt-1">1 URL ranking</span>
          </>
        ) : (
          <span className="pt-1">No URL ranking yet</span>
        )}
      </div>
    </SummaryCard>
  );
}

function WhatChangedSummary({
  keyword,
  state,
}: Readonly<{ keyword: KeywordRow; state: KeywordDetailWhatChanged }>) {
  const dimensions = deriveKeywordDetailChangeDimensions(keyword);
  const positionChange = describeKeywordDetailPositionChange(dimensions);
  const comparison =
    keyword.completedComparableChecks?.at(-2)?.checkedAt ??
    keyword.positionHistory.at(-2)?.checkedAt ??
    keyword.lastCheckAt;

  return (
    <SummaryCard label="What changed">
      {state === "no_change" ? (
        <span className="flex items-center gap-2 text-[12px] text-fg">
          <Minus className="text-fg-muted" size={13} weight="bold" />
          No changes since the previous check
        </span>
      ) : null}
      {state === "diff" ? (
        <>
          <div className="grid gap-2 text-[12px] text-fg">
            {positionChange ? (
              <span className="flex items-center gap-2">
                {positionChange.direction === "improved" ||
                positionChange.direction === "entered" ? (
                  <ArrowUp className="text-green-text" size={13} weight="bold" />
                ) : (
                  <ArrowDown className="text-red-text" size={13} weight="bold" />
                )}
                {positionChange.text}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Minus className="text-fg-muted" size={13} weight="bold" />
                No position change
              </span>
            )}
            <span className="flex items-center gap-2">
              {dimensions.rankingUrlChanged ? (
                <ArrowUpRight className="text-yellow-text" size={13} weight="bold" />
              ) : (
                <Minus className="text-fg-muted" size={13} weight="bold" />
              )}
              {dimensions.rankingUrlChanged ? "Ranking URL changed" : "Ranking URL unchanged"}
            </span>
          </div>
          <p className="m-0 mt-7 font-mono text-[10.5px] text-fg-muted">
            Compared with the check from {dateLabel(comparison)}
          </p>
        </>
      ) : null}
    </SummaryCard>
  );
}

export function KeywordMetricCards({
  chartState,
  keyword,
  keywordContext,
  whatChanged,
}: Readonly<KeywordMetricCardsProps>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <PositionSummary chartState={chartState} keyword={keyword} />
        <RankingUrlSummary keyword={keyword} />
        <WhatChangedSummary
          keyword={keyword}
          state={whatChanged ?? deriveKeywordDetailWhatChanged(keyword)}
        />
      </div>
      <KeywordContextRow
        keyword={keyword}
        state={keywordContext ?? inferredKeywordContext(keyword)}
      />
    </div>
  );
}
