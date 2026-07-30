import "server-only";

import { Context } from "@temporalio/activity";
import { flushAlertDigests } from "../alerts/digest";

export type FlushAlertDigestsActivityResult = Awaited<ReturnType<typeof flushAlertDigests>>;

export async function flushAlertDigestsActivity(): Promise<FlushAlertDigestsActivityResult> {
  const context = Context.current();
  return flushAlertDigests(new Date(), undefined, async (details) => {
    context.heartbeat(details);
    if (context.cancellationSignal.aborted) await context.cancelled;
  });
}
