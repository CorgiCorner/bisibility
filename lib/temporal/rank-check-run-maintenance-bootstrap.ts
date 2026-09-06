import "server-only";

import { rankCheckRunsScheduleDecision } from "../rank-check/run-maintenance-config";
import {
  type BootstrapScheduleClient,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
} from "./bootstrap";

export { rankCheckRunsScheduleDecision } from "../rank-check/run-maintenance-config";

export const RANK_CHECK_RUNS_SCHEDULE_ID = "maintenance-rank-check-runs";
export const RANK_CHECK_RUNS_WORKFLOW_TYPE = "reconcileRankCheckRunsWorkflow";

const DEFAULT_RANK_CHECK_RUNS_INTERVAL = "5 minutes";

export async function ensureRankCheckRunsSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  // Dispatcher mode cannot make progress without this reconciler. Legacy keeps the maintenance gate.
  const decision = rankCheckRunsScheduleDecision();
  return ensureSingletonSchedule(
    {
      enabled: decision.enabled,
      memo: { kind: "rank_check_runs" },
      note: "Rank-check run reconciliation",
      scheduleId: RANK_CHECK_RUNS_SCHEDULE_ID,
      spec: { intervals: [{ every: DEFAULT_RANK_CHECK_RUNS_INTERVAL }] },
      workflowType: RANK_CHECK_RUNS_WORKFLOW_TYPE,
    },
    client,
  );
}
