"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { LocalReportSummary } from "@/lib/local-reports/summary";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

export function LocalReportCard({
  report,
  namespace = "projectDashboard.localReport",
}: {
  report: LocalReportSummary;
  namespace?: "projectDashboard.localReport" | "projectRankTracker.localSummary";
}) {
  const t = useTranslations(namespace),
    ui = useTranslations("projectDashboard.localReport");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const number = (value: number | null) =>
    value === null ? t("unknown") : format.number(value, { maximumFractionDigits: 2 });
  const percent = (value: number | null) =>
    value === null
      ? t("unknown")
      : format.number(value / 100, { style: "percent", maximumFractionDigits: 1 });
  const metrics = [
    [ui("businessTop3"), percent(report.targetTop3)],
    [ui("averagePosition"), number(report.averageFoundSlot)],
    [ui("searchesWithPack"), percent(report.presence)],
    [
      ui("dataAvailable"),
      percent(report.observedCoverage === null ? null : report.observedCoverage * 100),
    ],
  ];
  return (
    <Card
      component="section"
      aria-label={t("title")}
      className="flex h-full min-w-0 flex-col gap-5"
    >
      <header>
        <h2 className="m-0 text-ui-section">{t("title")}</h2>
        <p className="mb-0 mt-1 text-sm text-fg-muted">{report.subject.name}</p>
      </header>
      <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-6">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs leading-5 text-fg-muted">{label}</dt>
            <dd className="m-0 mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-xs text-fg-muted">
        {ui("checkedKeywords", { measured: report.counts.measured, total: report.expected })}
      </p>
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <time dateTime={report.asOf} className="text-xs text-fg-muted">
          {format.dateTime(new Date(report.asOf), { dateStyle: "medium", timeStyle: "short" })}
        </time>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {ui("details")}
        </Button>
      </footer>
      <Modal open={open} onClose={() => setOpen(false)} title={ui("detailsTitle")}>
        <div className="space-y-5 text-sm leading-6">
          <p className="m-0">{ui("detailsIntro")}</p>
          <dl className="m-0 grid gap-4 sm:grid-cols-2">
            {[
              [t("conditional"), percent(report.conditionalTop3)],
              [
                t("matchCoverage"),
                percent(report.matchCoverage === null ? null : report.matchCoverage * 100),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-fg-muted">{label}</dt>
                <dd className="m-0 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0">
            {t("counts", {
              expected: format.number(report.expected),
              checks: format.number(report.retainedChecks),
              measured: format.number(report.counts.measured),
              unknown: format.number(report.counts.unknown + report.counts.neverChecked),
              found: format.number(report.averageFoundCount),
            })}
          </p>
          <p className="m-0 text-fg-muted">
            {t(
              report.freshness === "unknown"
                ? "freshnessUnknown"
                : report.freshness === "stale"
                  ? "stale"
                  : "fresh",
            )}
          </p>
          <p className="m-0 text-fg-muted">{ui("scopeHelp")}</p>
          <p className="m-0 text-fg-muted">{ui("comparisonHelp")}</p>
        </div>
      </Modal>
    </Card>
  );
}
