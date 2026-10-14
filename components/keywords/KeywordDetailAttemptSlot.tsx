"use client";

import { HistoryTime } from "@/components/keyword-detail-history/HistoryTime";
import { providerLabel } from "@/lib/checks/attempts";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useTranslations } from "next-intl";
import { KeywordDetailHeaderSlot } from "./KeywordDetailHeaderSlot";

export function KeywordDetailAttemptSlot({
  quality,
  timeZone,
}: Readonly<{ quality: KeywordDetailQuality; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  const detail = useTranslations("projectRankTracker.keywordDetail");
  const history = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const attempt = quality.rankQuality.latestAttempt;
  const execution = attempt?.status;
  const knownExecution =
    execution === "completed" ||
    execution === "failed" ||
    execution === "running" ||
    execution === "deferred";
  return (
    <KeywordDetailHeaderSlot
      label={t("lastRecordedAttempt")}
      state="textual"
      detail={
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {attempt ? (
            <span>
              {knownExecution ? history(`execution.${execution}`) : detail("common.unknown")}
            </span>
          ) : null}
          <span>
            {detail("header.provider", {
              provider: quality.latestAttemptProvider
                ? providerLabel(quality.latestAttemptProvider)
                : detail("common.unknown"),
            })}
          </span>
        </div>
      }
    >
      {attempt ? (
        <HistoryTime value={attempt.recordedAt} timeZone={timeZone} />
      ) : (
        detail("header.notCheckedYet")
      )}
    </KeywordDetailHeaderSlot>
  );
}
