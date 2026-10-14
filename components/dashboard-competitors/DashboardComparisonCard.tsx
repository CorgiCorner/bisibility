import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import type { DashboardComparisonReport } from "@/lib/dashboard-competitors/model";
import { COMPETITOR_SOV_DEFINITION } from "@/lib/rank-measurements/competitor-share";
import { getFormatter, getTranslations } from "next-intl/server";

export async function DashboardComparisonCard({ report }: { report: DashboardComparisonReport }) {
  if (
    report.current.quality.metricId !== "competitor_share_of_voice_top10" ||
    report.current.quality.definitionVersion !== COMPETITOR_SOV_DEFINITION ||
    (report.baseline && report.baseline.quality.definitionVersion !== COMPETITOR_SOV_DEFINITION)
  )
    throw new Error("Unsupported comparison definition.");
  const [t, format] = await Promise.all([
    getTranslations("shared.dashboardComparison"),
    getFormatter(),
  ]);
  const percentage = (value: number | null | undefined) =>
    value == null
      ? t("unknown")
      : format.number(value / 100, { style: "percent", maximumFractionDigits: 1 });
  return (
    <Card component="section" aria-label={t("title")}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{t("title")}</h2>
        <LocalizedMeasurementHelp
          metricId={report.current.quality.metricId}
          definitionVersion={report.current.quality.definitionVersion}
          report={{ counts: report.current.quality }}
        />
      </div>
      <p className="mt-2 text-sm text-fg-muted">
        {t("fixedCohort", { count: format.number(report.expectedIds.length) })}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="p-2">{t("domain")}</th>
              <th className="p-2">{t("current")}</th>
              <th className="p-2">{t("baseline")}</th>
              <th className="p-2">{t("change")}</th>
            </tr>
          </thead>
          <tbody>
            {report.current.shares.map((row) => {
              const baseline = report.baseline?.shares.find(
                (before) => before.domain === row.domain,
              )?.shareOfVoice;
              const delta = report.deltas.find(
                (value) => value.domain === row.domain,
              )?.percentagePoints;
              return (
                <tr key={row.domain} className="border-t border-border">
                  <th scope="row" className="p-2 font-medium">
                    {row.label}
                  </th>
                  <td className="p-2 tabular-nums">{percentage(row.shareOfVoice)}</td>
                  <td className="p-2 tabular-nums">{percentage(baseline)}</td>
                  <td className="p-2 tabular-nums">
                    {delta == null
                      ? t("unknown")
                      : t("percentagePoints", {
                          value: format.number(delta, {
                            maximumFractionDigits: 1,
                            signDisplay: "exceptZero",
                          }),
                        })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-fg-muted">
        {t("comparisonCoverage", {
          comparable: format.number(report.comparableCount),
          expected: format.number(report.expectedIds.length),
        })}
      </p>
      <p className="mt-2 text-xs text-fg-muted">{report.current.quality.definitionVersion}</p>
    </Card>
  );
}
