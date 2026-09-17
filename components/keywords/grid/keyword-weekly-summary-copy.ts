import type { useTranslations } from "next-intl";
import type { KeywordWeeklySummary } from "./keyword-weekly-summary";

type GridTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.grid">
>;

export function weeklySummarySentence(summary: KeywordWeeklySummary, t: GridTranslations) {
  switch (summary.kind) {
    case "steady":
      return t("weeklySteady");
    case "improved":
      return t("weeklyImproved", { improved: summary.improved ?? 0, total: summary.total ?? 0 });
    case "dropped":
      return t("weeklyDropped", {
        keyword: summary.keyword ?? "",
        position: summary.positionDelta ?? 0,
      });
    case "mixed":
      return t("weeklyMixed", {
        improved: summary.improved ?? 0,
        keyword: summary.keyword ?? "",
        position: summary.positionDelta ?? 0,
        total: summary.total ?? 0,
      });
  }
}
