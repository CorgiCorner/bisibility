import { FirstCheckBanner, FirstCheckBannerLink } from "@/components/rank-check/FirstCheckBanner";
import {
  FirstCheckBannerAction,
  type GetFirstCheckRunPlanAction,
  type QueueFirstChecksAction,
  type RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import { Card } from "@/components/ui";
import type { ProjectRef } from "@/lib/routing/app-path";
import { appPath, rankTrackerTabPath } from "@/lib/routing/app-path";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/ssr";
import { PositionDistributionCard } from "./PositionDistributionCard";
import { PositionTrendCard } from "./PositionTrendCard";
import type { DistributionBucket, OverviewView, TrendPoint } from "./types";

const kpis = [
  { label: "Avg. position", subline: "awaiting first check", value: "–", muted: true },
  { label: "Tracked keywords", subline: "status", value: "count", muted: false },
  { label: "In top 10", subline: "no data", value: "–", muted: true },
  { label: "Visibility", subline: "awaiting first check", value: "–", muted: true },
] as const;

export type NoDataBannerState =
  | "migration_hold"
  | "missing"
  | "needs_attention"
  | "ready"
  | "running";

function keywordLabel(keywordCount: number) {
  const label = `${keywordCount} keyword${keywordCount === 1 ? "" : "s"}`;
  return `${label} ${keywordCount === 1 ? "is" : "are"}`;
}

function bannerText(state: Exclude<NoDataBannerState, "ready">, keywordCount: number) {
  const keywords = keywordLabel(keywordCount);
  if (state === "migration_hold") {
    return {
      detail: "This project is on migration hold. Rank tracking will resume when the hold ends.",
      title: "Rank checks paused.",
    };
  }
  if (state === "missing") {
    return {
      detail: `${keywords} ready. Connect DataForSEO or SerpApi to start rank tracking.`,
      title: "SERP provider required.",
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
  getFirstCheckRunPlanAction,
  keywordCount,
  keywordId,
  projectId,
  projectRef,
  queueFirstChecksAction,
  runCheckNowAction,
  state,
}: Readonly<{
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
    const action = keywordId ? (
      <FirstCheckBannerAction
        getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
        keywordId={keywordId}
        projectId={projectId}
        projectRef={projectRef}
        queueFirstChecksAction={queueFirstChecksAction}
        runCheckNowAction={runCheckNowAction}
      />
    ) : (
      <FirstCheckBannerLink href={appPath(projectRef, "rank-tracker")} label="View keywords" />
    );
    return <FirstCheckBanner action={action} keywordCount={keywordCount} />;
  }

  const copy = bannerText(state, keywordCount);
  let action = (
    <FirstCheckBannerLink
      href={appPath(projectRef, "integrations#all-providers")}
      label="Connect SERP provider"
    />
  );
  if (state === "migration_hold") {
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
    action = (
      <FirstCheckBannerLink
        href={rankTrackerTabPath(projectRef, "checks")}
        label="View check runs"
      />
    );
  }

  // Same "toast" variant as the roadmap-preview SoonBanner: accent border + soft fill.
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-soft px-4 py-[13px] text-fg sm:flex-row sm:items-center sm:gap-3">
      <ClockCountdown aria-hidden className="shrink-0 text-accent-text" size={17} weight="fill" />
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-[1.5]">
        <strong className="font-semibold">{copy.title}</strong>{" "}
        <span className="text-fg-muted">{copy.detail}</span>
      </p>
      {action}
    </section>
  );
}

type NoDataKpiRowProps = {
  budgetExhausted: boolean;
  keywordCount: number;
  projectReadOnly: boolean;
  runningCheckCount: number;
  serpProviderState: OverviewView["serpProviderState"];
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
        const subline = kpi.subline === "status" ? keywordSubline : kpi.subline;
        const valueClassName = kpi.muted ? "text-fg-muted" : "text-fg";
        const sublineClassName = kpi.value === "count" ? "text-accent-text" : "text-fg-muted";

        return (
          <Card key={kpi.label} size="md" style={{ borderRadius: 14, padding: "16px 18px" }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
              {kpi.label}
            </div>
            <div
              className={`mt-2 text-[26px] font-semibold leading-none tracking-[-1px] ${valueClassName}`}
            >
              {value}
            </div>
            <div className={`mt-1 font-mono text-[11px] leading-normal ${sublineClassName}`}>
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
  trend,
}: Readonly<{ distribution: DistributionBucket[]; domain: string; trend: TrendPoint[] }>) {
  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
      <PositionTrendCard data={trend} empty seriesLabel={domain} />
      <PositionDistributionCard buckets={distribution} empty />
    </section>
  );
}
