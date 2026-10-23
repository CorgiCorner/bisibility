import "server-only";

import { type RankCheckSchedulerMode, rankCheckSchedulerMode } from "./scheduler-mode";

export type RankCheckRunsScheduleDecision = {
  enabled: boolean;
  reason: string;
};

function isTruthyFlag(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function scheduledMaintenanceEnabled() {
  const raw = process.env.SCHEDULED_MAINTENANCE_ENABLED?.trim();
  if (raw === undefined || raw.length === 0) {
    return true;
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
  return {
    enabled: scheduledMaintenanceEnabled(),
    reason: "SCHEDULED_MAINTENANCE_ENABLED controls maintenance during cutover",
  };
}

export function assertRankCheckRunsScheduleEnabled(
  mode: RankCheckSchedulerMode = rankCheckSchedulerMode(),
) {
  const decision = rankCheckRunsScheduleDecision(mode);
  if (!decision.enabled) {
    throw new Error(
      "Rank-check runs maintenance is disabled. Check SCHEDULED_MAINTENANCE_ENABLED.",
    );
  }
  return decision;
}
