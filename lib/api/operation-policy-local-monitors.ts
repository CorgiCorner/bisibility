import { policy } from "./operation-policy-helpers";

const runs = "/projects/{project_id}/local-monitors/{monitor_id}/runs";
const run = `${runs}/{run_id}`;
const point = `${run}/points/{target_id}`;
export const localMonitorReadPolicies = {
  listLocalMonitorRuns: policy("GET", runs, "read"),
  getLocalMonitorRunResults: policy("GET", `${run}/results`, "read"),
  listLocalMonitorPointListings: policy("GET", `${point}/listings`, "read"),
  listLocalMonitorPointHistory: policy("GET", `${point}/history`, "read"),
  exportLocalMonitorRun: policy("GET", `${run}/export`, "read"),
} as const;
