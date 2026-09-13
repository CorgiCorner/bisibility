import {
  FirstCheckBanner,
  FirstCheckBannerLink,
  keywordReadinessSubject,
} from "@/components/rank-check/FirstCheckBanner";
import {
  FirstCheckBannerAction,
  type GetFirstCheckRunPlanAction,
  type QueueFirstChecksAction,
  type RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { ProjectRef } from "@/lib/routing/app-path";
import { appPath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { VIEWER_ASK_ADMIN_SERP } from "@/lib/ui/viewer-affordances";
import { VISIBILITY_DESCRIPTION, visibilityCoverageCopy } from "@/lib/visibility/definition";
import type { ReactNode } from "react";
import { PositionDistributionCard } from "./PositionDistributionCard";
import { PositionTrendCard } from "./PositionTrendCard";
import type { DistributionBucket, OverviewView, TrendPoint } from "./types";

const kpis = [
  { label: "Avg. position", subline: "", value: "–", muted: true },
  { label: "Tracked keywords", subline: "status", value: "count", muted: false },
  { label: "In top 10", subline: "no data", value: "–", muted: true },
  { label: "Visibility", subline: "", value: "–", muted: true },
] as const;

export type NoDataBannerState =
  | "migration_hold"
  | "missing"
  | "needs_attention"
  | "ready"
  | "running";

function bannerText(state: Exclude<NoDataBannerState, "ready">, keywordCount: number) {
  const keywords = keywordReadinessSubject(keywordCount);
  if (state === "migration_hold") {
    return {
      detail: "This project is on migration hold. Rank tracking will resume when the hold ends.",
      title: "Rank checks paused.",
    };
  }
  if (state === "missing") {
    return {
      detail: "Connect DataForSEO or SerpApi to start rank tracking.",
      title: "SERP provider required",
    };
  }
  if (state === "needs_attention") {
    return {
      detail: `${keywords} ready. Enable or reconnect a SERP provider before the first rank check.`,
      title: "SERP provider needs attention.",
    };
  }
  return {
    detail: "Rankings will appear here when the current check finishes.",
    title: "First rank check in progress.",
  };
}

export function NoDataBanner({
  canCreateKeyword = true,
  canManageProviders = true,
  canRunChecks = true,
  getFirstCheckRunPlanAction,
  keywordCount,
  keywordId,
  projectId,
  projectRef,
  queueFirstChecksAction,
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
  queueFirstChecksAction: QueueFirstChecksAction;
  runCheckNowAction: RunFirstCheckAction;
  state: NoDataBannerState;
}>) {
  if (state === "ready") {
    const needsKeywords = !keywordId && keywordCount === 0;
    const action =
      keywordId && canRunChecks ? (
        <FirstCheckBannerAction
          getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
          keywordId={keywordId}
          projectId={projectId}
          projectRef={projectRef}
          queueFirstChecksAction={queueFirstChecksAction}
          runCheckNowAction={runCheckNowAction}
        />
      ) : needsKeywords && canCreateKeyword ? (
        <FirstCheckBannerLink
          href={appPath(projectRef, needsKeywords ? "rank-tracker?add=1" : "rank-tracker")}
          label={needsKeywords ? "Add keywords" : "View keywords"}
        />
      ) : !needsKeywords ? (
        <FirstCheckBannerLink href={appPath(projectRef, "rank-tracker")} label="View keywords" />
      ) : null;
    return (
      <FirstCheckBanner
        action={action}
        icon={needsKeywords ? "ranking" : "puzzle"}
        keywordCount={keywordCount}
      />
    );
  }

  const copy = bannerText(state, keywordCount);
  const viewerBlocked = !canManageProviders && (state === "missing" || state === "needs_attention");
  let action: ReactNode = (
    <FirstCheckBannerLink
      href={appPath(projectRef, "integrations#all-providers")}
      label="Connect"
    />
  );
  if (viewerBlocked) {
    action = undefined;
  } else if (state === "migration_hold") {
    action = (
      <FirstCheckBannerLink href={appPath(projectRef, "rank-tracker")} label="View keywords" />
    );
  } else if (state === "needs_attention") {
    action = (
      <FirstCheckBannerLink
        href={appPath(projectRef, "integrations#all-providers")}
        label="Manage provider"
      />
    );
  } else if (state === "running") {
    action = <FirstCheckBannerLink href={projectRunsPath(projectRef)} label="View check runs" />;
  }

  return (
    <FirstCheckBanner
      action={action}
      detail={viewerBlocked && state === "missing" ? VIEWER_ASK_ADMIN_SERP : copy.detail}
      title={copy.title}
    />
  );
}

type NoDataKpiRowProps = {
  budgetExhausted: boolean;
  keywordCount: number;
  projectReadOnly: boolean;
  runningCheckCount: number;
  serpProviderState: OverviewView["serpProviderState"];
  visibilityCoverage: OverviewView["visibilityCoverage"];
};

function trackedKeywordSubline({
  budgetExhausted,
  projectReadOnly,
  runningCheckCount,
  serpProviderState,
}: NoDataKpiRowProps) {
  if (projectReadOnly) return "paused · migration hold";
  if (budgetExhausted) return "monthly budget exhausted";
  if (serpProviderState === "missing") return "provider not connected";
  if (serpProviderState === "needs_attention") return "provider needs attention";
  if (runningCheckCount > 0) return "check in progress";
  return "ready to check";
}

export function NoDataKpiRow(props: Readonly<NoDataKpiRowProps>) {
  const { keywordCount } = props;
  const keywordSubline = trackedKeywordSubline(props);

  return (
    <section
      aria-label="Overview KPIs"
      className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {kpis.map((kpi) => {
        const value = kpi.value === "count" ? String(keywordCount) : kpi.value;
        const subline =
          kpi.label === "Visibility"
            ? visibilityCoverageCopy(props.visibilityCoverage)
            : kpi.subline === "status"
              ? keywordSubline
              : kpi.subline;
        const valueClassName = kpi.muted ? "text-fg-muted" : "text-fg";
        const sublineClassName = kpi.value === "count" ? "text-accent-text" : "text-fg-muted";

        return (
          <Card
            key={kpi.label}
            size="md"
            style={{ borderRadius: UI_RADIUS_ROLES.card, padding: "16px 18px" }}
          >
            <div className="flex items-center gap-1 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              <span>{kpi.label}</span>
              {kpi.label === "Visibility" ? <InfoTooltip text={VISIBILITY_DESCRIPTION} /> : null}
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
  source,
  trend,
}: Readonly<{
  distribution: DistributionBucket[];
  domain: string;
  source: ReactNode;
  trend: TrendPoint[];
}>) {
  return (
    <>
      <PositionTrendCard data={trend} empty seriesLabel={domain} />
      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <PositionDistributionCard buckets={distribution} empty />
        {source}
      </section>
    </>
  );
}
