import "server-only";

import type { SearchWorkflowStatus } from "@/lib/search-insights/sync/control-model";
import { getSchedulerTemporalClient } from "./scheduler-client";
import { searchInsightsBackfillWorkflowId } from "./search-insights-client";

export function normalizeSearchInsightsWorkflowStatus(name: string): SearchWorkflowStatus {
  if (name === "RUNNING") return "running";
  if (name === "COMPLETED") return "completed";
  if (["FAILED", "CANCELLED", "TERMINATED", "TIMED_OUT"].includes(name)) return "failed";
  return "unknown";
}

/** Missing or unavailable Temporal state is unknown and can never manufacture a stall. */
export async function describeSearchInsightsBackfillStatus(
  projectId: string,
  property: string,
): Promise<SearchWorkflowStatus> {
  try {
    const client = await getSchedulerTemporalClient();
    const workflowId = searchInsightsBackfillWorkflowId(projectId, property);
    const description = await client.workflow.getHandle(workflowId).describe();
    return normalizeSearchInsightsWorkflowStatus(description.status.name);
  } catch {
    return "unknown";
  }
}
