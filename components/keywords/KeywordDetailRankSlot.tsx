"use client";

import { HistoryTime } from "@/components/keyword-detail-history/HistoryTime";
import { positivePoint } from "@/components/keywords/grid/keyword-rank-quality-view";
import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { providerLabel } from "@/lib/checks/provider-label";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useFormatter, useTranslations } from "next-intl";
import { KeywordDetailComparison } from "./KeywordDetailComparison";
import { KeywordDetailHeaderSlot } from "./KeywordDetailHeaderSlot";

export function KeywordDetailRankSlot({
  quality,
  timeZone,
}: Readonly<{ quality: KeywordDetailQuality; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  const format = useFormatter();
  const detail = useTranslations("projectRankTracker.keywordDetail");
  const history = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const q = quality.rankQuality;
  const current = q.current;
  const positive = positivePoint(current);
  const historical = positivePoint(q.lastKnown.current) ?? positivePoint(q.lastKnown.lastSuccess);
  const legacy =
    !historical && q.lastKnown.current?.reportedPosition != null ? q.lastKnown.current : null;
  return (
    <KeywordDetailHeaderSlot
      label={detail("header.position")}
      prominent
      state={positive ? "numeric" : "textual"}
      detail={
        <div className="grid gap-1" data-testid="keyword-detail-qualified-position">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{history(`freshness.${current?.freshness ?? "unknown"}`)}</span>
            {q.currentScopeState === "unavailable" ? (
              <span>{t("currentScopeUnavailable")}</span>
            ) : null}
            <LocalizedMeasurementHelp metricId="organic_rank" definitionVersion="help-v1" />
          </div>
          {current ? (
            <div>
              {t("observed")} <HistoryTime value={current.observedAt} timeZone={timeZone} /> ·{" "}
              {t("recorded")} <HistoryTime value={current.recordedAt} timeZone={timeZone} /> ·{" "}
              {detail("header.provider", {
                provider: current.provider
                  ? providerLabel(current.provider)
                  : detail("common.unknown"),
              })}
            </div>
          ) : null}
          {!positive && historical ? (
            <div data-testid="keyword-detail-last-known">
              {t("lastKnown", { position: historical.position })} ·{" "}
              <HistoryTime value={historical.observedAt} timeZone={timeZone} />
            </div>
          ) : null}
          {!positive && legacy && legacy.reportedPosition !== null ? (
            <div data-testid="keyword-detail-stored-unqualified">
              {history("unqualifiedStoredValue", { value: format.number(legacy.reportedPosition) })}{" "}
              · <HistoryTime value={legacy.observedAt ?? legacy.recordedAt} timeZone={timeZone} />
            </div>
          ) : null}
          <KeywordDetailComparison quality={quality} timeZone={timeZone} />
          {quality.best ? (
            <div data-testid="keyword-detail-retained-best">
              {t(
                quality.best.definitionOrigin === "current_definition"
                  ? "bestCurrentDefinition"
                  : "bestLastKnownDefinition",
                { position: quality.best.position },
              )}{" "}
              · <HistoryTime value={quality.best.observedAt} timeZone={timeZone} /> ·{" "}
              {detail("header.provider", {
                provider: quality.best.provider
                  ? providerLabel(quality.best.provider)
                  : detail("common.unknown"),
              })}
              <span className="block">
                {t("bestCount", { count: quality.best.qualifyingCount })}
              </span>
            </div>
          ) : null}
          <div>
            {t("asOf")} <HistoryTime value={quality.asOf} timeZone={timeZone} />
          </div>
        </div>
      }
    >
      {positive
        ? history("rank", { position: format.number(positive.position) })
        : !current
          ? history("evidence.not_observed")
          : current.evidence === "known_absent"
            ? history("evidence.known_absent")
            : current.evidence === "unsupported"
              ? history("evidence.unsupported")
              : t("currentUnknown")}
    </KeywordDetailHeaderSlot>
  );
}
