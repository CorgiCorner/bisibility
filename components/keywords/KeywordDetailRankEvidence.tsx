"use client";

import { HistoryTime } from "@/components/keyword-detail-history/HistoryTime";
import { Disclosure } from "@/components/ui/Disclosure";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useFormatter, useTranslations } from "next-intl";
import { KeywordCheckProvider } from "./KeywordCheckProvider";
import { KeywordDetailScopeProof } from "./KeywordDetailScopeProof";

export function KeywordDetailRankEvidence({
  quality,
  timeZone,
}: Readonly<{ quality: KeywordDetailQuality; timeZone: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  const history = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const { current, baseline, comparison } = quality.rankQuality;
  return (
    <Disclosure
      className="rounded-none border-0 bg-transparent"
      summaryClassName="min-h-10 items-center sm:min-h-7 gap-2 rounded-control px-0 py-1 sm:px-0 [&>h3]:text-[11px] [&>h3]:font-medium [&>h3]:leading-5 [&>svg]:mt-0 [&>svg]:size-3"
      contentClassName="px-0 pb-0 pt-2 sm:px-0"
      title={t("measurementDetails")}
    >
      <div className="mb-3">
        <KeywordDetailScopeProof quality={quality} />
      </div>
      <dl className="m-0 grid gap-3 text-[11px] leading-5">
        {current ? (
          <>
            <div>
              <dt>{t("observed")}</dt>
              <dd className="m-0 text-fg">
                <HistoryTime value={current.observedAt} timeZone={timeZone} />
              </dd>
            </div>
            <div>
              <dt>{t("recorded")}</dt>
              <dd className="m-0 text-fg">
                <HistoryTime value={current.recordedAt} timeZone={timeZone} />
              </dd>
            </div>
          </>
        ) : null}
        {comparison === "comparable" && baseline ? (
          <div>
            <dt>{t("baseline")}</dt>
            <dd className="m-0 text-fg">
              {baseline.evidence === "positive" && baseline.position !== null
                ? history("rank", { position: format.number(baseline.position) })
                : history(`evidence.${baseline.evidence}`)}
              <span className="block text-fg-muted">
                <HistoryTime value={baseline.observedAt} timeZone={timeZone} />
              </span>
            </dd>
          </div>
        ) : null}
        {quality.best && quality.best.qualifyingCount > 1 ? (
          <div data-testid="keyword-detail-retained-best">
            <dt>
              {t(
                quality.best.definitionOrigin === "current_definition"
                  ? "bestCurrentDefinition"
                  : "bestLastKnownDefinition",
                { position: quality.best.position },
              )}
            </dt>
            <dd className="m-0 text-fg">
              <HistoryTime value={quality.best.observedAt} timeZone={timeZone} />
              <span className="block text-fg-muted">
                <KeywordCheckProvider provider={quality.best.provider} />
              </span>
              <span className="block text-fg-muted">
                {t("bestCount", { count: quality.best.qualifyingCount })}
              </span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{t("asOf")}</dt>
          <dd className="m-0 text-fg">
            <HistoryTime value={quality.asOf} timeZone={timeZone} />
          </dd>
        </div>
      </dl>
    </Disclosure>
  );
}
