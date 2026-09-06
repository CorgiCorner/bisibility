import "server-only";

import { launchQueuedRankCheckRuns } from "../rank-check/planner/queued-launch";
import { rankCheckRunWorkflowGateway } from "./rank-check-run-workflow-gateway";

type DispatchOptions = {
  launch?: typeof launchQueuedRankCheckRuns;
};

// Queued runs are durable rows; the maintenance sweep still launches anything this misses.
// This path exists so a "Run now" starts within seconds instead of at the next sweep.
export function dispatchQueuedRankCheckRunIntents(options: DispatchOptions = {}) {
  return (options.launch ?? launchQueuedRankCheckRuns)({
    startRun: rankCheckRunWorkflowGateway.startRun,
  });
}
