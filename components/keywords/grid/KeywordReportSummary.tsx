"use client";

import { HelpButton } from "@/components/ui/HelpButton";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { Tooltip } from "@/components/ui/Tooltip";
import { resolveMeasurementHelp } from "@/lib/measurement-help/resolve";
import type { ReportSummaryPresentation } from "@/lib/rank-reports/presentation";
import { useFormatter, useTranslations } from "next-intl";

/** Only a full-scope server report can populate these values; page rows are never an input. */
export function KeywordReportSummary({
  report,
  expected,
  pending = false,
}: Readonly<{ report?: ReportSummaryPresentation; expected: number; pending?: boolean }>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid.quality");
  const helpT = useTranslations("shared.measurementHelp");
  const format = useFormatter();
  if (pending)
    return (
      <div data-testid="keyword-full-scope-report" aria-busy="true">
        <SummaryStrip loading className="rounded-none border-t border-border-soft px-4" />
      </div>
    );
  if (!report)
    return (
      <SummaryStrip
        className="rounded-none border-t border-border-soft px-4"
        sentence={t("summaryUnavailable", { expected: format.number(expected) })}
      />
    );
  const metric = report.metric;
  const help = resolveMeasurementHelp(metric.metricId, metric.definitionVersion, metric);
  const title =
    help.status === "supported" || help.status === "unsupported_version"
      ? helpT(help.entry.titleKey)
      : t("metric");
  const value =
    metric.value === null
      ? t("unknown")
      : format.number(metric.value, { maximumFractionDigits: 2 });
  const percent = (value: number | null) =>
    value === null
      ? t("unknown")
      : format.number(value, { style: "percent", maximumFractionDigits: 1 });
  const date = (value: string) => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime())
      ? format.dateTime(parsed, { dateStyle: "medium", timeStyle: "short" })
      : t("dateUnknown");
  };
  const delta =
    report.comparison === "not_requested"
      ? null
      : metric.delta === null
        ? t("comparisonUnavailable")
        : t("metricDelta", {
            delta: format.number(metric.delta, {
              maximumFractionDigits: 2,
              signDisplay: "exceptZero",
            }),
          });
  const counts = metric.counts;
  const fullSummary = t("scopeSummary", {
    title,
    value,
    expected: format.number(counts.expected),
    ranked: format.number(counts.ranked),
    absent: format.number(counts.knownAbsent),
    unknown: format.number(counts.unknown),
  });
  return (
    <div
      data-testid="keyword-full-scope-report"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-soft bg-bg-sunken px-4 py-1.5 text-[12.5px]"
    >
      <span role="status" aria-label={`${title}: ${value}`} className="font-medium">
        {title}: {value}
      </span>
      <span className="text-fg-muted">
        {t("measuredCount", {
          measured: format.number(counts.measured),
          expected: format.number(counts.expected),
        })}
      </span>
      <span className="text-fg-muted">{t(`freshness.${metric.freshness}`)}</span>
      <Tooltip
        semantics="description"
        placement="top"
        content={
          <div className="grid gap-2 text-left">
            <p>
              {helpT(
                help.status === "supported" ? help.entry.shortDefinitionKey : "neutralDefinition",
              )}
            </p>
            <p>{fullSummary}</p>
            {!pending ? (
              <div className="flex flex-col gap-1 text-left">
                <span>
                  {t("coverage", {
                    data: percent(metric.dataCoverage),
                    observed: percent(metric.observedCoverage),
                  })}
                </span>
                <span>{t(`freshness.${metric.freshness}`)}</span>
                {delta ? <span>{delta}</span> : null}
                {report.movementCounts ? (
                  <span>
                    {t("movementDirections", {
                      improved: format.number(report.movementCounts.improved),
                      declined: format.number(report.movementCounts.declined),
                    })}
                  </span>
                ) : null}
                <span>
                  {t("qualityCounts", {
                    failed: format.number(counts.failed),
                    stale: format.number(counts.stale),
                    unsupported: format.number(counts.unsupported),
                    comparable: format.number(counts.comparable),
                  })}
                </span>
                <span>{t("asOf", { date: date(report.timeBasis.asOf) })}</span>
                {report.timeBasis.currentNotBefore ? (
                  <span>
                    {t("currentSince", { date: date(report.timeBasis.currentNotBefore) })}
                  </span>
                ) : null}
                {report.timeBasis.baseline ? (
                  <span>
                    {report.timeBasis.baseline.notBefore
                      ? t("baselineWindow", {
                          from: date(report.timeBasis.baseline.notBefore),
                          to: date(report.timeBasis.baseline.before),
                        })
                      : t("baselineBefore", { date: date(report.timeBasis.baseline.before) })}
                  </span>
                ) : (
                  <span>{t("comparisonNotRequested")}</span>
                )}
                {metric.compositionReason === "baseline_membership_unavailable" ? (
                  <span>{t("compositionUnknown")}</span>
                ) : metric.compositionChanges !== null ? (
                  <span>
                    {t("compositionChanges", {
                      added: format.number(metric.compositionChanges.added),
                      removed: format.number(metric.compositionChanges.removed),
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      >
        <HelpButton aria-label={helpT("explain", { title })} />
      </Tooltip>
    </div>
  );
}
