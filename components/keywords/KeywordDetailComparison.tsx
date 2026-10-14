"use client";

import { HistoryTime } from "@/components/keyword-detail-history/HistoryTime";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useFormatter, useTranslations } from "next-intl";

export function KeywordDetailComparison({
  quality,
  timeZone,
}: Readonly<{ quality: KeywordDetailQuality; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  const format = useFormatter();
  const history = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const q = quality.rankQuality;
  const numeric =
    q.comparison === "comparable" &&
    q.current?.evidence === "positive" &&
    q.baseline?.evidence === "positive" &&
    q.movement !== null &&
    Number.isFinite(q.movement);
  const movement = numeric ? q.movement : null;
  const label =
    movement !== null
      ? t(movement > 0 ? "improved" : movement < 0 ? "dropped" : "unchanged", {
          count: Math.abs(movement),
        })
      : q.comparison === "not_requested"
        ? t("comparisonNotRequested")
        : q.event === "entered" ||
            q.event === "exited" ||
            q.event === "re_entered" ||
            q.event === "first"
          ? history(`events.${q.event}`)
          : q.comparison === "comparable"
            ? history("events.unknown")
            : t("comparisonUnavailable");
  return (
    <div
      data-testid="keyword-detail-quality-comparison"
      className="flex flex-wrap gap-x-2 gap-y-0.5"
    >
      <span>{label}</span>
      {q.comparison === "comparable" && q.baseline ? (
        <span>
          {t("baseline")}{" "}
          {q.baseline.evidence === "positive" && q.baseline.position !== null
            ? history("rank", { position: format.number(q.baseline.position) })
            : history(`evidence.${q.baseline.evidence}`)}{" "}
          · <HistoryTime value={q.baseline.observedAt} timeZone={timeZone} />
        </span>
      ) : null}
    </div>
  );
}
