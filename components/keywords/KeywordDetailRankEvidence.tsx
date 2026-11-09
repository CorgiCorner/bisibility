"use client";

import { HistoryTime } from "@/components/keyword-detail-history/HistoryTime";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { KeywordDetailQuality } from "@/lib/keyword-detail/quality-model";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { KeywordCheckProvider } from "./KeywordCheckProvider";
import { KeywordDetailComparison } from "./KeywordDetailComparison";

export function KeywordDetailRankEvidence({
  quality,
  timeZone,
}: Readonly<{ quality: KeywordDetailQuality; timeZone: string }>) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("projectRankTracker.keywordDetail.quality");
  const history = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const format = useFormatter();
  const { current, baseline, comparison } = quality.rankQuality;
  return (
    <>
      <Button
        variant="outline"
        size="xs"
        className="w-fit justify-self-start"
        onClick={() => setOpen(true)}
      >
        {t("measurementDetails")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("measurementDetails")}>
        <dl className="m-0 grid gap-5 text-sm leading-6 sm:grid-cols-2 [&_dt]:text-xs [&_dt]:text-fg-muted">
          {current?.evidence !== "positive" ? (
            <div className="sm:col-span-2">
              <KeywordDetailComparison quality={quality} timeZone={timeZone} />
            </div>
          ) : null}
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
          <div>
            <dt>{t("asOf")}</dt>
            <dd className="m-0 text-fg">
              <HistoryTime value={quality.asOf} timeZone={timeZone} />
            </dd>
          </div>
          {quality.best && quality.best.qualifyingCount > 1 ? (
            <div
              data-testid="keyword-detail-retained-best"
              className="border-t border-border pt-4 sm:col-span-2"
            >
              <dt>
                {t(
                  quality.best.definitionOrigin === "current_definition"
                    ? "bestCurrentDefinition"
                    : "bestLastKnownDefinition",
                  { position: quality.best.position },
                )}
              </dt>
              <dd className="m-0 mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-fg">
                <HistoryTime value={quality.best.observedAt} timeZone={timeZone} />
                <span className="text-fg-muted">
                  <KeywordCheckProvider provider={quality.best.provider} />
                </span>
                <span className="text-fg-muted">
                  {t("bestCount", { count: quality.best.qualifyingCount })}
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      </Modal>
    </>
  );
}
