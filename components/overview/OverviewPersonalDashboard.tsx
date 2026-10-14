import type { DashboardCompositorProps } from "@/components/dashboard-layout/DashboardCompositor";
import { PersonalDashboardSurface } from "@/components/dashboard-layout/PersonalDashboardSurface";
import { LocalReportCard } from "@/components/dashboard-local/LocalReportCard";
import { LocalSubjectControl } from "@/components/dashboard-local/LocalSubjectControl";
import { localReportSummary } from "@/components/dashboard-local/report-summary";
import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { ViewAllKeywordsButton } from "@/components/overview/OverviewNoDataBottom";
import type { OverviewCompetitorComparison } from "@/lib/competitors/overview-comparison";
import type { DashboardAccess, DashboardLayout, ProjectionId } from "@/lib/dashboard-layout/types";
import type { LocalDashboardContext, LocalReport } from "@/lib/dashboard-local/model";
import type { DashboardSurfacePreference } from "@/lib/project-surface-preferences/dashboard-model";
import type { CheckHealth } from "@/lib/queries/check-health";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ByMarketRollup } from "./ByMarketRollup";
import { DataSourcePanel } from "./DataSourcePanel";
import { HighlightLists } from "./HighlightLists";
import { OverviewCompetitorsCard } from "./OverviewCompetitorsCard";
import { OverviewContributorsCard } from "./OverviewContributorsCard";
import { OverviewHealthBanners } from "./OverviewHealthBanners";
import { OverviewKpiGrid } from "./OverviewKpiGrid";
import { OverviewReportHistoryCard } from "./OverviewReportHistoryCard";
import { OverviewToolbar } from "./OverviewToolbar";
import { PositionDistributionCard } from "./PositionDistributionCard";
import { PositionTrendCard } from "./PositionTrendCard";
import type { OverviewView } from "./types";

export async function OverviewPersonalDashboard({
  overview,
  checkHealth,
  competitors,
  canCreateKeyword,
  personal,
  loadedProjections,
  localReport,
  failedProjections = [],
}: {
  overview: OverviewView;
  checkHealth: CheckHealth | null;
  failedProjections?: readonly ProjectionId[];
  competitors: OverviewCompetitorComparison | null;
  canCreateKeyword: boolean;
  personal: {
    access: DashboardAccess;
    layout: DashboardLayout;
    preference: DashboardSurfacePreference;
    scopeKey: string;
    local?: LocalDashboardContext | null;
  };
  loadedProjections: readonly ProjectionId[];
  localReport?: LocalReport | null;
}) {
  const [t, format] = await Promise.all([
    getTranslations("shared.dashboardLayout"),
    getFormatter(),
  ]);
  const projectRef = overview.publicId;
  const report = overview.qualityReport;
  const ready = (content: ReactNode) => ({ state: "ready" as const, content });
  const loaded = (projection: ProjectionId, content: ReactNode) =>
    failedProjections.includes(projection)
      ? { state: "error" as const }
      : loadedProjections.includes(projection)
        ? ready(content)
        : { state: "not_loaded" as const };
  const widgets: DashboardCompositorProps["widgets"] = {
    ...(localReport
      ? {
          local_business_results: loaded(
            "local_business_observations",
            <LocalReportCard report={localReportSummary(localReport)} />,
          ),
        }
      : {}),
    visibility_history: loaded(
      "visibility_history",
      <OverviewReportHistoryCard history={overview.reportHistory} />,
    ),
    quality_history: loaded(
      "quality_history",
      <OverviewReportHistoryCard history={overview.reportHistory} quality />,
    ),
    contributors: loaded(
      "contributions",
      <OverviewContributorsCard
        rows={overview.contributors}
        report={report}
        projectRef={projectRef}
      />,
    ),
    organic_kpis: loaded(
      "organic_summary",
      <OverviewKpiGrid
        kpis={overview.kpis}
        projectRef={projectRef}
        visibilityCoverage={overview.visibilityCoverage}
        qualityReport={overview.qualityReport}
      />,
    ),
    position_trend: loaded(
      "position_history",
      <PositionTrendCard
        data={overview.trend}
        empty={overview.trend.length === 0}
        seriesLabel={overview.domain}
        takeaway={overview.trendTakeaway}
      />,
    ),
    position_distribution: loaded(
      "organic_summary",
      <PositionDistributionCard
        buckets={overview.distribution}
        empty={overview.distribution.every(({ count }) => count === 0)}
      />,
    ),
    recent_targets: loaded(
      "keyword_highlights",
      <HighlightLists
        lists={overview.highlights.filter(({ kind }) => kind === "recentlyAdded")}
        projectRef={projectRef}
      />,
    ),
    data_source: checkHealth
      ? loaded(
          "connection_details",
          <DataSourcePanel checkHealth={checkHealth} health={overview.dataSource} />,
        )
      : { state: "error" },
    by_market: loaded(
      "market_rollup",
      <ByMarketRollup
        device={overview.toolbar.deviceValue}
        projectRef={projectRef}
        rows={overview.byMarket}
      />,
    ),
    movers: loaded(
      "keyword_highlights",
      <HighlightLists
        lists={overview.highlights.filter(({ kind }) => kind !== "recentlyAdded")}
        projectRef={projectRef}
      />,
    ),
    ...(failedProjections.includes("competitor_comparison")
      ? { competitor_comparison: { state: "error" as const } }
      : competitors
        ? {
            competitor_comparison: loaded(
              "competitor_comparison",
              <OverviewCompetitorsCard data={competitors} projectRef={projectRef} />,
            ),
          }
        : {}),
  };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PersonalDashboardSurface
        key={personal.scopeKey}
        access={personal.access}
        layout={personal.layout}
        preference={personal.preference}
        widgets={widgets}
        integratedToolbar
        localControl={
          personal.local ? (
            <LocalSubjectControl local={personal.local} preference={personal.preference} />
          ) : undefined
        }
        shell={{
          scope: (
            <OverviewToolbar
              canCreateKeyword={canCreateKeyword}
              initialSelected={overview.toolbar}
              placement="inline"
              projectRef={projectRef}
            />
          ),
          mode: overview.projectReadOnly ? (
            <p className="text-sm text-fg-muted">{t("readOnly")}</p>
          ) : null,
          health:
            checkHealth && checkHealth.failed24h.count > 0 ? (
              <OverviewHealthBanners checkHealth={checkHealth} projectRef={projectRef} />
            ) : null,
          budget: checkHealth?.budget.exhausted ? (
            <p className="text-sm text-fg-muted">{t("budgetBlocked")}</p>
          ) : null,
          coverage: (
            <div className="flex items-start gap-2 text-xs leading-5 text-fg-muted">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <p>
                  {t("coverageSummary", {
                    measured: format.number(report.counts.measured),
                    expected: format.number(report.counts.expected),
                    comparable: format.number(report.counts.comparable),
                  })}
                </p>
                <p>
                  {t(report.dataCoverage === null ? "freshnessUnknown" : "freshCoverage", {
                    count: format.number(report.counts.freshDeterminate ?? 0),
                  })}
                </p>
                <time dateTime={report.asOf}>
                  {format.dateTime(new Date(report.asOf), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <LocalizedMeasurementHelp
                metricId="data_quality"
                definitionVersion="help-v1"
                report={{ counts: report.counts }}
              />
            </div>
          ),
        }}
      />
      <ViewAllKeywordsButton projectRef={projectRef} />
    </div>
  );
}
