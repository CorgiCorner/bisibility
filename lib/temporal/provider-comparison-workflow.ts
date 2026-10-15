import { proxyActivities } from "@temporalio/workflow";
import type { executeProviderComparisonActivity } from "./provider-comparison-activities";

const { executeProviderComparisonActivity: execute } = proxyActivities<{
  executeProviderComparisonActivity: typeof executeProviderComparisonActivity;
}>({
  startToCloseTimeout: "5 minutes",
  retry: { maximumAttempts: 3, initialInterval: "5 seconds" },
});
export async function providerComparisonWorkflow(input: { projectId: string; runId: string }) {
  // Durable per-side claims turn interrupted retries into unknown, never another paid submit.
  await Promise.all([
    execute({ ...input, provider: "dataforseo" }),
    execute({ ...input, provider: "serpapi" }),
  ]);
}
