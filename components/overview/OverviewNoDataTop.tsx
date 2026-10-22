"use client";
import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { FirstCheckBanner, FirstCheckBannerLink } from "@/components/rank-check/FirstCheckBanner";
import {
  FirstCheckBannerAction,
  type GetFirstCheckRunPlanAction,
  type RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import { Card } from "@/components/ui/Card";
import { ProviderAccessActions } from "@/components/ui/ProviderAccessActions";
import { useSharedErrorMessages } from "@/i18n/useSharedErrorMessages";
import type { BudgetDenialReason } from "@/lib/metering/budget-denial";
import type { ProjectRef } from "@/lib/routing/app-path";
import { appPath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import {
  VISIBILITY_DEFINITION_VERSION_V1,
  VISIBILITY_METRIC_ID_V1,
} from "@/lib/visibility/definition";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { FirstCheckIntro } from "./FirstCheckIntro";
import { RecentlyAddedCard } from "./OverviewNoDataBottom";
import { PositionDistributionCard } from "./PositionDistributionCard";
import { PositionTrendCard } from "./PositionTrendCard";
import type { DistributionBucket, OverviewView, TrendPoint } from "./types";

const kpis = [
  { id: "averagePosition", muted: true, subline: "", value: "empty" },
  { id: "trackedKeywords", muted: false, subline: "status", value: "count" },
  { id: "inTop10", muted: true, subline: "noData", value: "empty" },
  { id: "visibility", muted: true, subline: "", value: "empty" },
] as const;

export type NoDataBannerState =
  | "migration_hold"
  | "missing"
  | "needs_attention"
  | "ready"
  | "running";

function bannerText(
  state: Exclude<NoDataBannerState, "ready">,
  keywordCount: number,
  t: ReturnType<typeof useTranslations<"projectDashboard.noData">>,
) {
  if (state === "migration_hold") {
    return {
      detail: t("migrationHoldDetail"),
      title: t("migrationHoldTitle"),
    };
  }
  if (state === "missing") {
    return {
      detail: t("providerMissingDetail"),
      title: t("providerMissingTitle"),
    };
  }
  if (state === "needs_attention") {
    return {
      detail: t("providerNeedsAttentionDetail", { count: keywordCount }),
      title: t("providerNeedsAttentionTitle"),
    };
  }
  return {
    detail: t("firstCheckInProgressDetail"),
    title: t("firstCheckInProgressTitle"),
  };
}

export function NoDataBanner({
  canManageProviders = true,
  canRunChecks = true,
  getFirstCheckRunPlanAction,
  keywordCount,
  keywordId,
  projectId,
  projectRef,
  runCheckNowAction,
  state,
}: Readonly<{
  canCreateKeyword?: boolean;
  canManageProviders?: boolean;
  canRunChecks?: boolean;
  getFirstCheckRunPlanAction: GetFirstCheckRunPlanAction;
  keywordCount: number;
  keywordId: string | null;
  projectId: string;
  projectRef: ProjectRef;
  runCheckNowAction: RunFirstCheckAction;
  state: NoDataBannerState;
}>) {
  const t = useTranslations("projectDashboard.noData");
  if (state === "ready") {
    if (!keywordId || !canRunChecks || keywordCount === 0) return null;
    return (
      <FirstCheckIntro
        key={projectId}
        projectId={projectId}
        action={
          <FirstCheckBannerAction
            getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
            keywordId={keywordId}
            projectId={projectId}
            projectRef={projectRef}
            runCheckNowAction={runCheckNowAction}
          />
        }
      />
    );
  }

  const copy = bannerText(state, keywordCount, t);
  const viewerBlocked = !canManageProviders && (state === "missing" || state === "needs_attention");
  let action: ReactNode = (
    <ProviderAccessActions href={appPath(projectRef, "integrations#all-providers")}>
      <FirstCheckBannerLink
        href={appPath(projectRef, "integrations#all-providers")}
        label={t("connect")}
      />
    </ProviderAccessActions>
  );
  if (viewerBlocked) {
    action = undefined;
  } else if (state === "migration_hold") {
    action = (
      <FirstCheckBannerLink href={appPath(projectRef, "rank-tracker")} label={t("viewKeywords")} />
    );
  } else if (state === "needs_attention") {
    action = (
      <FirstCheckBannerLink
        href={appPath(projectRef, "integrations#all-providers")}
        label={t("manageProvider")}
      />
    );
  } else if (state === "running") {
    action = <FirstCheckBannerLink href={projectRunsPath(projectRef)} label={t("viewCheckRuns")} />;
  }

  return (
    <FirstCheckBanner
      action={action}
      detail={viewerBlocked && state === "missing" ? t("viewerAskAdmin") : copy.detail}
      title={copy.title}
    />
  );
}

type NoDataKpiRowProps = {
  budgetExhausted: boolean;
  budgetReason?: BudgetDenialReason;
  keywordCount: number;
  projectReadOnly: boolean;
  runningCheckCount: number;
  serpProviderState: OverviewView["serpProviderState"];
  visibilityCoverage: OverviewView["visibilityCoverage"];
};

function trackedKeywordSubline(
  { budgetExhausted, projectReadOnly, runningCheckCount, serpProviderState }: NoDataKpiRowProps,
  t: ReturnType<typeof useTranslations<"projectDashboard.noData">>,
) {
  if (projectReadOnly) return t("pausedMigrationHold");
  if (budgetExhausted) return t("monthlyBudgetExhausted");
  if (serpProviderState === "missing") return t("providerNotConnected");
  if (serpProviderState === "needs_attention") return t("providerNeedsAttention");
  if (runningCheckCount > 0) return t("checkInProgress");
  return t("readyToCheck");
}

export function NoDataKpiRow(props: Readonly<NoDataKpiRowProps>) {
  const format = useFormatter();
  const t = useTranslations("projectDashboard.noData");
  const kpiT = useTranslations("projectDashboard.kpis");
  const dashboardT = useTranslations("projectDashboard.dashboard");
  const { keywordCount } = props;
  const errors = useSharedErrorMessages();
  const keywordSubline =
    props.budgetReason === "budget_missing"
      ? errors.budgetMissing()
      : props.budgetReason === "usage_reconciliation_required"
        ? errors.usageReconciliationRequired()
        : trackedKeywordSubline(props, t);

  return (
    <section
      aria-label={dashboardT("kpisAriaLabel")}
      className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {kpis.map((kpi) => {
        const value = kpi.value === "count" ? format.number(keywordCount) : "–";
        const subline =
          kpi.id === "visibility"
            ? kpiT("visibilityDetail", {
                limited: props.visibilityCoverage.limited ? "true" : "false",
                measured: props.visibilityCoverage.measured,
                total: props.visibilityCoverage.total,
              })
            : kpi.subline === "status"
              ? keywordSubline
              : kpi.subline === "noData"
                ? t("noData")
                : kpi.subline;
        const valueClassName = kpi.muted ? "text-fg-muted" : "text-fg";
        const sublineClassName = kpi.value === "count" ? "text-accent-text" : "text-fg-muted";

        return (
          <Card
            key={kpi.id}
            size="md"
            style={{ borderRadius: UI_RADIUS_ROLES.card, padding: "16px 18px" }}
          >
            <div className="flex items-center gap-1 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              <span>
                {kpi.id === "averagePosition"
                  ? kpiT("averagePosition")
                  : kpi.id === "trackedKeywords"
                    ? kpiT("trackedKeywords")
                    : kpi.id === "inTop10"
                      ? kpiT("inTop10")
                      : kpiT("visibility")}
              </span>
              {kpi.id === "visibility" ? (
                <span className="-my-2.5 inline-flex">
                  <LocalizedMeasurementHelp
                    metricId={VISIBILITY_METRIC_ID_V1}
                    definitionVersion={VISIBILITY_DEFINITION_VERSION_V1}
                  />
                </span>
              ) : kpi.id === "averagePosition" ? (
                <span className="-my-2.5 inline-flex">
                  <LocalizedMeasurementHelp
                    metricId="average_ranked_position"
                    definitionVersion="help-v1"
                  />
                </span>
              ) : null}
            </div>
            <div
              className={`mt-2 text-[26px] font-semibold leading-none tracking-[-1px] ${valueClassName}`}
            >
              {value}
            </div>
            <div
              className={`mt-1 font-sans tabular-nums text-[11px] leading-normal ${sublineClassName}`}
            >
              {subline}
            </div>
          </Card>
        );
      })}
    </section>
  );
}

export function NoDataCharts({
  distribution,
  domain,
  projectRef,
  recentlyAddedRows,
  trend,
}: Readonly<{
  distribution: DistributionBucket[];
  domain: string;
  projectRef: string;
  recentlyAddedRows: OverviewView["highlights"][number]["rows"];
  trend: TrendPoint[];
}>) {
  return (
    <>
      <PositionTrendCard data={trend} empty seriesLabel={domain} />
      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <PositionDistributionCard buckets={distribution} empty />
        <RecentlyAddedCard projectRef={projectRef} rows={recentlyAddedRows} />
      </section>
    </>
  );
}
