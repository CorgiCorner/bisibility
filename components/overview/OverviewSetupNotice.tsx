import { getFirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { runCheckNow } from "@/lib/actions/rankCheck";
import type { CheckHealth } from "@/lib/queries/check-health";
import { NoDataBanner } from "./OverviewNoDataTop";
import type { OverviewView } from "./types";

export function OverviewSetupNotice({
  overview,
  checkHealth,
  canCreateKeyword,
  canManageProviders,
  canRunChecks,
}: {
  overview: OverviewView;
  checkHealth: CheckHealth | null;
  canCreateKeyword: boolean;
  canManageProviders: boolean;
  canRunChecks: boolean;
}) {
  if (!checkHealth || overview.state === "populated") return null;
  const state = overview.projectReadOnly
    ? "migration_hold"
    : checkHealth.runningCount > 0
      ? "running"
      : overview.serpProviderState;
  const firstCheck =
    state === "ready" &&
    overview.firstCheckSourceReady === true &&
    canRunChecks &&
    overview.firstPendingKeywordId &&
    !checkHealth.budget.exhausted &&
    !overview.hasEverChecked;
  if (state === "ready" && !firstCheck) return null;
  return (
    <NoDataBanner
      canCreateKeyword={canCreateKeyword}
      canManageProviders={canManageProviders}
      canRunChecks={canRunChecks}
      getFirstCheckRunPlanAction={getFirstCheckRunPlan}
      keywordCount={overview.trackedKeywordCount ?? 0}
      keywordId={overview.firstPendingKeywordId}
      projectId={overview.publicId}
      projectRef={overview.publicId}
      runCheckNowAction={runCheckNow}
      state={state}
    />
  );
}
