import { reserveLiveResponseCapacity } from "@/lib/providers/live-capacity";
import { consumeProviderLimit, ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { assertTrackingDeadline, TrackingDispatchDeniedError } from "./dispatch-error";

export async function admitTrackingRequest(input: {
  credentials: ProviderCredentials;
  projectId?: string;
  deadline: string;
  liveResponses?: boolean;
}) {
  try {
    assertTrackingDeadline(input.deadline);
    const gate = await consumeProviderLimit("dataforseo", input.credentials, {
      projectId: input.projectId,
    });
    if (!gate.success)
      throw new ProviderRateLimitedError("dataforseo", {
        accountKey: gate.accountKey,
        resetAt: gate.resetAt,
      });
    const reservation = input.liveResponses
      ? await reserveLiveResponseCapacity(input.credentials, input.projectId)
      : undefined;
    assertTrackingDeadline(input.deadline);
    return reservation;
  } catch (cause) {
    if (cause instanceof TrackingDispatchDeniedError) throw cause;
    throw new TrackingDispatchDeniedError(cause);
  }
}
