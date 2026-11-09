"use client";

import { HistoryTime } from "@/components/keyword-detail-history/HistoryTime";
import { positivePoint } from "@/components/keywords/grid/keyword-rank-quality-view";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useFormatter, useTranslations } from "next-intl";
import { KeywordDetailComparison } from "./KeywordDetailComparison";
import { KeywordDetailHeaderSlot } from "./KeywordDetailHeaderSlot";
import { KeywordDetailRankEvidence } from "./KeywordDetailRankEvidence";

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
      prominent={Boolean(positive)}
      state={positive ? "numeric" : "textual"}
      detail={
        <div className="grid gap-1.5 text-[12px]" data-testid="keyword-detail-qualified-position">
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
          {current?.freshness === "stale" ? <span>{history("freshness.stale")}</span> : null}
          <KeywordDetailRankEvidence quality={quality} timeZone={timeZone} />
        </div>
      }
    >
      <span className="min-w-0">
        {positive
          ? history("rank", { position: format.number(positive.position) })
          : !current
            ? history("evidence.not_observed")
            : current.evidence === "known_absent"
              ? history("evidence.known_absent")
              : current.evidence === "unsupported"
                ? history("evidence.unsupported")
                : t("currentUnknown")}
      </span>
      {positive && q.event !== "first" ? (
        <div className="ml-2">
          <KeywordDetailComparison quality={quality} timeZone={timeZone} showBaseline={false} />
        </div>
      ) : null}
    </KeywordDetailHeaderSlot>
  );
}
