"use client";

import type { RankReportObservation } from "@/lib/rank-reports/records";
import { useTranslations } from "next-intl";
import { HistoryResultKind } from "./HistoryResultKind";

export function HistoryScope({
  scope,
}: Readonly<{ scope: RankReportObservation["configuredScope"] }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  if (!scope) return <span>{t("unknownScope")}</span>;
  return (
    <span className="block text-[11px] text-fg-muted">
      {[scope.engine, scope.surface].join(" / ")} / <HistoryResultKind kind={scope.resultKind} /> /{" "}
      {[scope.rankScale, scope.location, scope.language, scope.device].join(" / ")}
      <span className="block">
        {t("revision", { value: scope.targetRevision ?? t("unknown") })}
      </span>
    </span>
  );
}
