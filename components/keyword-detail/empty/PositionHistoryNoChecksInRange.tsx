import {
  ChartEmptyMessage,
  ChartFooterItem,
  EmptyChartShell,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { rankObservationState } from "@/lib/serp/rank-depth";
import { useTranslations } from "next-intl";

export type PositionHistoryNoChecksInRangeProps = {
  latestPosition?: number | null;
};

function latestRankLabel(position: number | null | undefined) {
  return rankObservationState({ completedChecks: 2, position, trackedDepth: 20 }).label;
}

export function PositionHistoryNoChecksInRange({
  latestPosition = 3,
}: Readonly<PositionHistoryNoChecksInRangeProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  return (
    <EmptyChartShell height={280} selectedRange="7d">
      <ChartEmptyMessage
        description={t("noChecksDays", { days: 7 })}
        footer={
          <>
            <ChartFooterItem>
              {t("latest", { position: latestRankLabel(latestPosition) })}
            </ChartFooterItem>
            <span aria-hidden className="h-3 border-l border-border" />
            <ChartFooterItem>{t("paused")}</ChartFooterItem>
          </>
        }
        title={t("noChecksRange")}
      />
    </EmptyChartShell>
  );
}
