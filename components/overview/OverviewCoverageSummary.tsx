"use client";

import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { useFormatter, useTranslations } from "next-intl";
import type { OverviewView } from "./types";

export function OverviewCoverageSummary({
  report,
  emptyProject,
}: Readonly<{
  report: Pick<OverviewView["qualityReport"], "counts" | "asOf">;
  emptyProject: boolean;
}>) {
  const t = useTranslations("shared.dashboardLayout");
  const format = useFormatter();
  const { expected, measured } = report.counts;
  const message =
    expected === 0
      ? t(emptyProject ? "coverageEmpty" : "coverageFilteredEmpty")
      : measured === 0
        ? t("coveragePending")
        : t("coverageSummary", {
            measured: format.number(measured),
            expected: format.number(expected),
          });
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-6 text-fg-muted"
      data-overview-coverage
    >
      <div className="flex min-w-0 max-w-full items-start gap-2" data-coverage-message>
        <p className="m-0 min-w-0">{message}</p>
        <LocalizedMeasurementHelp
          metricId="data_quality"
          definitionVersion="help-v1"
          report={{ counts: report.counts }}
        />
      </div>
      {measured > 0 ? (
        <time className="sm:ml-1" dateTime={report.asOf}>
          {format.dateTime(new Date(report.asOf), { dateStyle: "medium", timeStyle: "short" })}
        </time>
      ) : null}
    </div>
  );
}
