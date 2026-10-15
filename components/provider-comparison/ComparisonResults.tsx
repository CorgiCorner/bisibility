"use client";

import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { useFormatter, useTranslations } from "next-intl";

export function ComparisonResults({ run, timeZone }: { run: ComparisonRun; timeZone: string }) {
  const t = useTranslations("projectRankTracker.keywordDetail.providerComparison");
  const format = useFormatter();
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
      {run.sides.map((side) => {
        const result = side.result;
        const observedAt = result?.observedAt ? new Date(result.observedAt) : null;
        return (
          <section className="min-w-0 rounded-control border border-border p-3" key={side.provider}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">{t(`providers.${side.provider}`)}</h3>
              <span className="text-xs text-fg-muted">{t(`statuses.${side.status}`)}</span>
            </div>
            <p className="mt-3 text-xl font-semibold tabular-nums">
              {result?.position && result.position > 0
                ? `#${format.number(result.position)}`
                : t(result?.evidence === "known_absent" ? "outside" : "noPosition")}
            </p>
            {observedAt && Number.isFinite(observedAt.getTime()) ? (
              <p className="mt-1 text-xs text-fg-muted">
                {format.dateTime(observedAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                })}
              </p>
            ) : null}
            {result ? (
              <div className="mt-2 flex items-center gap-1 text-xs text-fg-muted">
                <span>{t(result.completeness === "complete" ? "complete" : "uncertain")}</span>
                <InfoTooltip text={t("qualityHelp")} />
              </div>
            ) : null}
            {result?.rankingUrl ? (
              <p className="mt-2 break-all text-xs text-fg-muted">{result.rankingUrl}</p>
            ) : null}
            {side.reason ? <p className="mt-2 text-xs text-fg-muted">{t("attention")}</p> : null}
          </section>
        );
      })}
    </div>
  );
}
