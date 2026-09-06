import "server-only";

import { type RankCheckSchedulerMode, rankCheckSchedulerMode } from "./scheduler-mode";

export type RankCheckRunsScheduleDecision = {
  enabled: boolean;
  reason: string;
};

function isFalseyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "0" || value === "false" || value === "no" || value === "off";
}

function isTruthyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function scheduledMaintenanceEnabled() {
  const raw = process.env.SCHEDULED_MAINTENANCE_ENABLED?.trim();
  if (raw === undefined || raw.length === 0) {
    return !isFalseyFlag(process.env.RANK_CHECK_RECONCILER_ENABLED);
  }
  return isTruthyFlag(raw);
}

export function rankCheckRunsScheduleDecision(
  mode: RankCheckSchedulerMode = rankCheckSchedulerMode(),
): RankCheckRunsScheduleDecision {
  if (mode === "dispatcher") {
    return {
      enabled: true,
      reason: "RANK_CHECK_SCHEDULER_MODE=dispatcher requires run reconciliation",
    };
  }
  const maintenanceFlag = process.env.SCHEDULED_MAINTENANCE_ENABLED?.trim();
  return {
    enabled: scheduledMaintenanceEnabled(),
    reason:
      maintenanceFlag === undefined || maintenanceFlag.length === 0
        ? "RANK_CHECK_RECONCILER_ENABLED controls legacy maintenance fallback"
        : "SCHEDULED_MAINTENANCE_ENABLED controls legacy maintenance",
  };
}

export function assertRankCheckRunsScheduleEnabled(
  mode: RankCheckSchedulerMode = rankCheckSchedulerMode(),
) {
  const decision = rankCheckRunsScheduleDecision(mode);
  if (!decision.enabled) {
    throw new Error(
      "Rank-check runs maintenance is disabled. Check SCHEDULED_MAINTENANCE_ENABLED and RANK_CHECK_RECONCILER_ENABLED.",
    );
  }
  return decision;
}
