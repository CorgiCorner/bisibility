"use client";

import type { RankReportObservation } from "@/lib/rank-reports/records";
import { useFormatter, useTranslations } from "next-intl";

/** A stored legacy value stays readable without becoming a qualified or current rank. */
export function HistoryPosition({ observation }: Readonly<{ observation: RankReportObservation }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  if (observation.evidence === "positive" && observation.position !== null)
    return <span>{t("rank", { position: format.number(observation.position) })}</span>;
  const stored = observation.reportedPosition;
  return (
    <span>
      <span>{t(`evidence.${observation.evidence}`)}</span>
      {stored !== null && Number.isFinite(stored) ? (
        <span className="mt-1 block text-[11px] font-normal text-fg-muted">
          {t("unqualifiedStoredValue", { value: format.number(stored) })}
        </span>
      ) : null}
    </span>
  );
}
