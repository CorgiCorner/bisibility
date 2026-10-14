import { PersonalDashboardSurface } from "@/components/dashboard-layout/PersonalDashboardSurface";
import { OverviewHealthBanners } from "@/components/overview/OverviewHealthBanners";
import { OverviewToolbar } from "@/components/overview/OverviewToolbar";
import { Card } from "@/components/ui/Card";
import type { CheckHealth } from "@/lib/queries/check-health";
import type { loadDashboardPersonalContext } from "@/lib/queries/dashboard-personal-context";
import { getFormatter, getTranslations } from "next-intl/server";
import { ComparisonSelectionControl } from "./ComparisonSelectionControl";
import { DashboardComparisonCard } from "./DashboardComparisonCard";

export async function DashboardComparisonSurface({
  personal,
  checkHealth,
}: {
  personal: Awaited<ReturnType<typeof loadDashboardPersonalContext>>;
  checkHealth: CheckHealth | null;
}) {
  const comparison = personal.comparison,
    report = comparison?.report;
  if (!comparison || !report || comparison.state !== "ready")
    throw new Error("Comparison scope is unavailable.");
  const [t, layout, format] = await Promise.all([
    getTranslations("shared.dashboardComparison"),
    getTranslations("shared.dashboardLayout"),
    getFormatter(),
  ]);
  const coverage = report.current.quality;
  const percent = (value: number | null) =>
    value === null
      ? t("unknown")
      : format.number(value, { style: "percent", maximumFractionDigits: 0 });
  return (
    <PersonalDashboardSurface
      key={personal.scopeKey}
      access={personal.access}
      layout={personal.composition.layout}
      preference={personal.preference}
      localControl={
        <ComparisonSelectionControl comparison={comparison} preference={personal.preference} />
      }
      widgets={{
        quality_history: { state: "not_loaded" },
        competitor_comparison: {
          state: "ready",
          content: <DashboardComparisonCard report={report} />,
        },
        data_source: checkHealth
          ? {
              state: "ready",
              content: (
                <Card>
                  <h2 className="font-semibold">{layout("widgets.data_source.label")}</h2>
                  <p className="mt-2 text-sm text-fg-muted">
                    {t(checkHealth.providerConnected ? "providerConnected" : "providerMissing")}
                  </p>
                </Card>
              ),
            }
          : { state: "error" },
      }}
      shell={{
        scope: (
          <div>
            <OverviewToolbar
              canCreateKeyword={false}
              projectRef={personal.preference.projectId}
              initialSelected={{
                availableTags: report.current.tags,
                deviceValue: report.filters.device,
                marketValues: report.filters.marketIds,
                rangeValue: report.filters.range,
                tagValue: report.filters.tag,
                marketOptions: [
                  {
                    label: report.current.location,
                    secondary: report.current.languageLabel,
                    value: report.current.locationId,
                  },
                ],
              }}
            />
            <p className="text-sm text-fg-muted">
              {t("scope", {
                location: report.current.location,
                language: report.current.languageLabel,
                device: t(report.current.device),
              })}
            </p>
          </div>
        ),
        mode: <p>{layout("presentationOnly")}</p>,
        health: !checkHealth ? (
          <p>{layout("healthUnknown")}</p>
        ) : checkHealth.failed24h.count ? (
          <OverviewHealthBanners
            checkHealth={checkHealth}
            projectRef={personal.preference.projectId}
          />
        ) : (
          <p>{layout("healthClear")}</p>
        ),
        budget: (
          <p>
            {layout(
              !checkHealth
                ? "budgetUnknown"
                : checkHealth.budget.exhausted
                  ? "budgetBlocked"
                  : "budgetReadOnly",
            )}
          </p>
        ),
        coverage: (
          <div className="flex flex-col gap-2 text-sm text-fg-muted">
            <p>
              {t("coverage", {
                measured: format.number(coverage.measured),
                expected: format.number(coverage.expected),
                observed: percent(coverage.observedCoverage),
                fresh: percent(coverage.dataCoverage),
              })}
            </p>
            <p>
              {t("asOf")}{" "}
              <time dateTime={report.asOf}>
                {format.dateTime(new Date(report.asOf), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </p>
            <p>
              {t("baselineAsOf")}{" "}
              {report.baselineAsOf ? (
                <time dateTime={report.baselineAsOf}>
                  {format.dateTime(new Date(report.baselineAsOf), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              ) : (
                t("unknown")
              )}
            </p>
          </div>
        ),
      }}
    />
  );
}
