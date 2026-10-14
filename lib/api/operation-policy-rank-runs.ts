import { policy } from "./operation-policy-helpers";
export const rankRunOperationPolicies = {
  listRankCheckRuns: policy("GET", "/projects/{project_id}/rank-check-runs", "read"),
  getRankCheckRun: policy("GET", "/projects/{project_id}/rank-check-runs/{run_id}", "read"),
} as const;
