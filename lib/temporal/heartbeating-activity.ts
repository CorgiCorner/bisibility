import "server-only";

import { Context } from "@temporalio/activity";

export type HeartbeatingActivityOptions = {
  details: Record<string, unknown>;
  heartbeatMs: number;
};

function activityContext() {
  try {
    return Context.current();
  } catch {
    // Called directly rather than through Temporal: nothing to heartbeat to.
    return null;
  }
}

// One cancellation contract for every provider-bound activity. A heartbeat can report a
// cancellation the operation never saw, so waiting on it here ends this attempt instead of
// letting it keep fetching and writing beside the retry Temporal has already started.
export async function heartbeatingActivity<T>(
  options: HeartbeatingActivityOptions,
  operation: (signal?: AbortSignal) => Promise<T>,
): Promise<T> {
  const context = activityContext();
  if (!context) return operation();
  context.heartbeat(options.details);
  const heartbeat = setInterval(() => context.heartbeat(options.details), options.heartbeatMs);
  try {
    const result = await operation(context.cancellationSignal);
    if (context.cancellationSignal.aborted) await context.cancelled;
    return result;
  } catch (error) {
    if (context.cancellationSignal.aborted) await context.cancelled;
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
