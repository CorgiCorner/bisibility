"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import type { LocalReportSummary } from "@/lib/local-reports/summary";
import { useFormatter, useTranslations } from "next-intl";

/** All cards consume the same full-cohort DTO; no measurement or provider work occurs in render. */
export function LocalReportCard({
  report,
  namespace = "projectDashboard.localReport",
}: {
  report: LocalReportSummary;
  namespace?: "projectDashboard.localReport" | "projectRankTracker.localSummary";
}) {
  const t = useTranslations(namespace);
  const format = useFormatter();
  const number = (value: number | null) =>
    value === null ? t("unknown") : format.number(value, { maximumFractionDigits: 2 });
  const percent = (value: number | null) =>
    value === null
      ? t("unknown")
      : format.number(value / 100, { style: "percent", maximumFractionDigits: 2 });
  const metrics = [
    ["presence", percent(report.presence)],
    ["top3", percent(report.targetTop3)],
    ["conditional", percent(report.conditionalTop3)],
    ["average", number(report.averageFoundSlot)],
    ["matchCoverage", percent(report.matchCoverage === null ? null : report.matchCoverage * 100)],
    ["coverage", percent(report.observedCoverage === null ? null : report.observedCoverage * 100)],
  ] as const;
  return (
    <Card component="section" aria-label={t("title")} className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 className="font-medium">{t("title")}</h2>
        <p className="text-sm text-fg-muted">{report.subject.name}</p>
      </header>
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {metrics.map(([key, value]) => (
          <div key={key}>
            <dt className="text-sm text-fg-muted">{t(key)}</dt>
            <dd className="text-lg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-fg-muted">
        {t("counts", {
          expected: format.number(report.expected),
          checks: format.number(report.retainedChecks),
          measured: format.number(report.counts.measured),
          unknown: format.number(report.counts.unknown + report.counts.neverChecked),
          found: format.number(report.averageFoundCount),
        })}
      </p>
      <p className="text-sm text-fg-muted">
        {t(
          report.freshness === "unknown"
            ? "freshnessUnknown"
            : report.freshness === "stale"
              ? "stale"
              : "fresh",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <LocalizedMeasurementHelp metricId="feature_presence" definitionVersion="help-v1" />
        <LocalizedMeasurementHelp metricId="business_slot" definitionVersion="help-v1" />
        <LocalizedMeasurementHelp
          metricId="data_quality"
          definitionVersion="help-v1"
          report={{ counts: report.counts }}
        />
      </div>
      <p className="text-sm text-fg-muted">{t("scope")}</p>
      <p className="text-sm text-fg-muted">{t("comparisonUnavailable")}</p>
      <footer className="text-xs text-fg-muted">
        <time dateTime={report.asOf}>
          {format.dateTime(new Date(report.asOf), { dateStyle: "medium", timeStyle: "short" })}
        </time>
        <details>
          <summary>{t("definition")}</summary>
          <p>
            {t("versions", {
              identity: report.subject.identityRevisionId,
              matcher: report.subject.matcherVersion,
            })}
          </p>
        </details>
      </footer>
    </Card>
  );
}
