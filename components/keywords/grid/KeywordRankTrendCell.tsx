"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";
import {
  hasRetainedRankHistory,
  keywordRankMovement,
  keywordRankQuality,
} from "./keyword-rank-quality-view";
import { NoDataValue } from "./market-grid-cells";

export function KeywordRankTrendCell({
  formatPosition,
  row,
}: Readonly<{ formatPosition: (value: number) => string; row: KeywordRow }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid.quality");
  if (!hasRetainedRankHistory(row))
    return (
      <NoDataValue
        className="block w-[92px]"
        label={t(keywordRankQuality(row) ? "historyUnavailable" : "historyQualificationUnknown")}
      />
    );
  const movement = keywordRankMovement(row);
  const color =
    movement === null || movement === 0
      ? "var(--accent)"
      : movement > 0
        ? "var(--green-text)"
        : "var(--red-text)";
  return (
    <Tooltip content={t("retainedHistoryHelp")}>
      <span className="block">
        <Sparkline
          ariaLabel={t("retainedHistory", { keyword: row.keyword })}
          color={color}
          data={row.sparkline}
          valueFormatter={(value) =>
            typeof value === "number" && Number.isFinite(value) && value > 0
              ? formatPosition(value)
              : ""
          }
        />
      </span>
    </Tooltip>
  );
}
