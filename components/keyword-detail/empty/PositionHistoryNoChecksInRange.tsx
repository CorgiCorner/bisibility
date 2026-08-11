import {
  ChartEmptyMessage,
  ChartFooterItem,
  EmptyChartShell,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { rankObservationState } from "@/lib/serp/rank-depth";

export type PositionHistoryNoChecksInRangeProps = {
  latestPosition?: number | null;
};

function latestRankLabel(position: number | null | undefined) {
  return rankObservationState({ completedChecks: 2, position, trackedDepth: 20 }).label;
}

export function PositionHistoryNoChecksInRange({
  latestPosition = 3,
}: Readonly<PositionHistoryNoChecksInRangeProps>) {
  return (
    <EmptyChartShell height={280} selectedRange="7d">
      <ChartEmptyMessage
        description="No checks in the last 7 days."
        footer={
          <>
            <ChartFooterItem>Latest {latestRankLabel(latestPosition)}</ChartFooterItem>
            <span aria-hidden className="h-3 border-l border-border-strong" />
            <ChartFooterItem>Paused</ChartFooterItem>
          </>
        }
        title="No checks in this range"
      />
    </EmptyChartShell>
  );
}
