import {
  CancellationScope,
  continueAsNew,
  isCancellation,
  proxyActivities,
  sleep,
} from "@temporalio/workflow";
import { trackingPollDelayMs } from "../ai-tracking/execution/polling";
import type { collectAiTrackingRunActivity } from "./ai-tracking-activities";
import type { AiTrackingProgress, AiTrackingWorkflowInput } from "./ai-tracking-contract";

const { collectAiTrackingRunActivity: collect } = proxyActivities<{
  collectAiTrackingRunActivity: typeof collectAiTrackingRunActivity;
}>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 3, initialInterval: "5 seconds", maximumInterval: "30 seconds" },
});
export async function aiTrackingRunWorkflow(
  input: AiTrackingWorkflowInput,
): Promise<AiTrackingProgress> {
  let polls = input.polls ?? 0;
  try {
    while (true) {
      const progress = await collect(input);
      if (
        !progress.pending ||
        (progress.deadline !== null && Date.now() >= Date.parse(progress.deadline))
      )
        return progress;
      polls += 1;
      if (polls % 20 === 0) return continueAsNew<typeof aiTrackingRunWorkflow>({ ...input, polls });
      await sleep(trackingPollDelayMs(input.runId, polls));
    }
  } catch (error) {
    if (!isCancellation(error)) throw error;
    return CancellationScope.nonCancellable(() => collect({ ...input, collectionOnly: true }));
  }
}
