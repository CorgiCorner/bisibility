import {
  ChartEmptyMessage,
  ChartFooterItem,
  EmptyChartShell,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { rankObservationState } from "@/lib/serp/rank-depth";

export type PositionHistoryOneCheckProps = {
  nextCheckLabel?: string;
  position?: number | null;
};

function currentRankLabel(position: number | null | undefined) {
  return rankObservationState({ completedChecks: 1, position, trackedDepth: 20 }).label;
}

export function PositionHistoryOneCheck({
  nextCheckLabel = "Not scheduled",
  position = 3,
}: Readonly<PositionHistoryOneCheckProps>) {
  return (
    <EmptyChartShell height={180} selectedRange="30d">
      <span
        aria-label="Single rank check point"
        className="absolute left-[12.33%] top-[36.8%] z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg-elev"
      />
      <span
        aria-hidden
        className="absolute left-[12.33%] top-[36.8%] z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-solid"
      />
      <ChartEmptyMessage
        footer={
          <ChartFooterItem>
            Current {currentRankLabel(position)} | Next check {nextCheckLabel}
          </ChartFooterItem>
        }
        title="Not enough history to chart yet."
      />
    </EmptyChartShell>
  );
}
