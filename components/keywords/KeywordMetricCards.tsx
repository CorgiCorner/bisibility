import { Card, MonoText } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import { hasTrackedPosition, isPositionOutsideTrackedDepth } from "@/lib/serp/rank-depth";
import Tooltip from "@mui/material/Tooltip";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CircleIcon as Circle,
  WarningIcon as Warning,
} from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

type KeywordMetricCardsProps = {
  keyword: KeywordRow;
};

const METRIC_CARD_SX = { padding: "14px 16px" } as const;

type MetricCardProps = {
  children: ReactNode;
  footer?: ReactNode;
  label: string;
  labelHint?: ReactNode;
};

function MetricCard({ children, footer, label, labelHint }: Readonly<MetricCardProps>) {
  return (
    <Card className="flex flex-col" size="sm" sx={METRIC_CARD_SX}>
      <div className="flex items-center justify-between gap-2">
        <MonoText className="uppercase tracking-[0.7px]" muted size="sm">
          {label}
        </MonoText>
        {labelHint}
      </div>
      <div className="mt-auto flex min-h-7 items-end pt-3">{children}</div>
      <div className="mt-1.5 flex h-[5px] items-center">{footer}</div>
    </Card>
  );
}

function formatVolume(volume: number) {
  if (volume >= 10000) {
    return `${(volume / 1000).toFixed(0)}k`;
  }
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}k`;
  }
  return String(volume);
}

function positionDelta(keyword: KeywordRow) {
  if (keyword.positionBaseline === null) {
    return { color: "var(--accent)", icon: null, label: "New", title: "First observation" };
  }
  const change = keyword.positionBaseline - keyword.position;
  if (change > 0) {
    return { color: "var(--green)", icon: ArrowUp, label: String(change), title: `Up ${change}` };
  }
  if (change < 0) {
    return {
      color: "var(--red)",
      icon: ArrowDown,
      label: String(Math.abs(change)),
      title: `Down ${Math.abs(change)}`,
    };
  }
  return { color: "var(--fg-faint)", icon: Circle, label: "0", title: "No change" };
}

function difficultyColor(score: number) {
  if (score < 35) {
    return "var(--green)";
  }
  if (score < 65) {
    return "var(--yellow)";
  }
  return "var(--red)";
}

function difficultyLabel(score: number) {
  if (score < 35) {
    return "Easy";
  }
  if (score < 65) {
    return "Medium";
  }
  return "Hard";
}

export function KeywordMetricCards({ keyword }: Readonly<KeywordMetricCardsProps>) {
  const delta = positionDelta(keyword);
  const DeltaIcon = delta.icon;
  const hasCpc = keyword.cpcKnown !== false;
  const hasDifficulty = keyword.difficultyKnown !== false;
  const hasVolume = keyword.volumeKnown !== false;
  const notFound = keyword.hasRankData && isPositionOutsideTrackedDepth(keyword.position);
  const trackedPosition = hasTrackedPosition(keyword);
  const kdColor = hasDifficulty ? difficultyColor(keyword.difficulty) : "var(--fg-faint)";
  const kdLabel = hasDifficulty ? difficultyLabel(keyword.difficulty) : null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
      <MetricCard label="Position">
        <div className="flex items-baseline gap-[7px]">
          {!keyword.hasRankData ? (
            <span className="text-[15px] font-semibold text-fg-muted">No data</span>
          ) : notFound ? (
            <span className="text-[15px] font-semibold text-fg-muted">
              {`Not found in top ${keyword.trackedDepth ?? 100}`}
            </span>
          ) : (
            <span className="text-2xl font-bold tracking-[-0.6px]">#{keyword.position}</span>
          )}
          {trackedPosition ? (
            DeltaIcon ? (
              <Tooltip title={delta.title}>
                <span
                  aria-label={delta.title}
                  className="inline-flex items-center gap-[3px] font-mono text-[11px] font-semibold"
                  style={{ color: delta.color }}
                >
                  <DeltaIcon
                    size={delta.label === "0" ? 7 : 11}
                    weight={delta.label === "0" ? "fill" : "bold"}
                  />
                  {delta.label}
                </span>
              </Tooltip>
            ) : (
              <span
                aria-label={delta.title}
                className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-semibold text-accent"
              >
                {delta.label}
              </span>
            )
          ) : null}
        </div>
      </MetricCard>
      <MetricCard label="Best">
        <div className="text-2xl font-bold tracking-[-0.6px]">
          {keyword.bestPosition === null ? "-" : `#${keyword.bestPosition}`}
        </div>
      </MetricCard>
      <MetricCard label="Volume">
        <div className="text-2xl font-bold tracking-[-0.6px]">
          {hasVolume ? (
            <>
              {formatVolume(keyword.volume)}
              <span className="text-xs font-medium text-fg-faint">/mo</span>
            </>
          ) : (
            <span className="text-[15px] font-semibold text-fg-muted">No data</span>
          )}
        </div>
      </MetricCard>
      <MetricCard label="CPC">
        <div className="text-2xl font-bold tracking-[-0.6px]">
          {hasCpc ? (
            `$${keyword.cpc}`
          ) : (
            <span className="text-[15px] font-semibold text-fg-muted">No data</span>
          )}
        </div>
      </MetricCard>
      <MetricCard
        footer={
          hasDifficulty ? (
            <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-bg-sunken">
              <div
                className="h-full"
                style={{ backgroundColor: kdColor, width: `${keyword.difficulty}%` }}
              />
            </div>
          ) : null
        }
        label="Difficulty"
        labelHint={
          kdLabel ? (
            <span
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.4px]"
              style={{ color: kdColor }}
            >
              {kdLabel}
            </span>
          ) : null
        }
      >
        <div className="flex items-baseline gap-[3px]">
          {hasDifficulty ? (
            <>
              <span className="text-2xl font-bold tracking-[-0.6px]" style={{ color: kdColor }}>
                {keyword.difficulty}
              </span>
              <span className="font-mono text-xs text-fg-faint">/100</span>
            </>
          ) : (
            <span className="text-[15px] font-semibold text-fg-muted">No data</span>
          )}
        </div>
      </MetricCard>
      <MetricCard
        footer={
          keyword.rankingPages > 1 ? (
            <div className="inline-flex items-center gap-1 font-mono text-[9.5px] font-semibold text-yellow">
              <Warning size={12} weight="fill" />
              Cannibalization
            </div>
          ) : null
        }
        label="Ranking pages"
      >
        <div className="text-2xl font-bold tracking-[-0.6px]">{keyword.rankingPages}</div>
      </MetricCard>
    </div>
  );
}
