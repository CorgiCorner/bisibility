"use client";

import { HistoryTime, historyExternalUrl } from "@/components/keyword-detail-history/HistoryTime";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useTranslations } from "next-intl";
import { pathLabel } from "./keyword-detail-header-format";

/** A historical URL is explicitly separate from the current-definition URL slot. */
export function KeywordDetailRetainedUrl({
  quality,
  timeZone,
}: Readonly<{ quality: KeywordDetailQuality; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  const detail = useTranslations("projectRankTracker.keywordDetail");
  const q = quality.rankQuality;
  if (q.current?.evidence === "positive") return null;
  const point =
    q.lastKnown.current?.evidence === "positive" ? q.lastKnown.current : q.lastKnown.lastSuccess;
  const href = historyExternalUrl(point?.rankingUrl ?? null);
  if (!href || !point) return null;
  return (
    <span className="mt-1 block" data-testid="keyword-detail-retained-url">
      {t("lastKnownUrl")}:{" "}
      <a
        href={href}
        rel="noreferrer noopener"
        target="_blank"
        className="font-semibold text-accent-text hover:underline"
      >
        {pathLabel(href, detail("common.notAvailable"))}
      </a>{" "}
      · <HistoryTime value={point.observedAt} timeZone={timeZone} />
    </span>
  );
}
