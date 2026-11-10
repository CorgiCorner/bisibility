import { proxyActivities, workflowInfo } from "@temporalio/workflow";
import type { resolveSerpUrlsActivity } from "./serp-url-repair-activity";
import type { SerpUrlRepairInput } from "./serp-url-repair-client";

const { resolveSerpUrlsActivity: resolve } = proxyActivities<{
  resolveSerpUrlsActivity: typeof resolveSerpUrlsActivity;
}>({
  startToCloseTimeout: "15 minutes",
  retry: { maximumAttempts: 3, initialInterval: "15 seconds" },
});
export async function serpUrlRepairWorkflow(input: SerpUrlRepairInput) {
  return resolve({ ...input, runId: workflowInfo().runId });
}
