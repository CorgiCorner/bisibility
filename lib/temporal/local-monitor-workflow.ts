import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";
import type { executeLocalMonitorIntentActivity } from "./local-monitor-activities";

const { executeLocalMonitorIntentActivity: execute } = proxyActivities<{
  executeLocalMonitorIntentActivity: typeof executeLocalMonitorIntentActivity;
}>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3, initialInterval: "5 seconds", maximumInterval: "30 seconds" },
});
export async function localMonitorRunWorkflow(input: {
  id: string;
  polls?: number;
}): Promise<void> {
  let polls = input.polls ?? 0;
  while (true) {
    const result = await execute({ id: input.id });
    if (result.state !== "pending" || result.nextPollMs === null) return;
    polls += 1;
    if (polls >= 20)
      return continueAsNew<typeof localMonitorRunWorkflow>({ id: input.id, polls: 0 });
    await sleep(result.nextPollMs);
  }
}
