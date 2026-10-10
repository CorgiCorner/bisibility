import "server-only";
import { consume } from "@/lib/api/ratelimit";
import { ProviderCallError } from "./call-error";
import { providerAccountKey } from "./rate-limit";
import type { ProviderCredentials } from "./types";

// Conservative shared admission: <=5s reservation-to-fetch fence + <=120s client
// HTTP budget + <=120s documented server task duration. Aborting HTTP does not
// cancel a purchased task. All Responses engines share this account bucket.
// https://docs.dataforseo.com/v3/ai_optimization-chat_gpt-llm_responses-live/
export const LIVE_RESPONSE_CAPACITY = 30;
export const LIVE_RESPONSE_WINDOW_SECONDS = 245;
export type LiveResponseReservation = { dispatchExpiresAt: number };
export function assertLiveResponseCapacity(reservation: LiveResponseReservation) {
  if (Date.now() >= reservation.dispatchExpiresAt)
    throw new ProviderCallError("Live Responses capacity reservation expired before dispatch.", 0);
}
export async function reserveLiveResponseCapacity(
  credentials: ProviderCredentials,
  projectId?: string,
) {
  try {
    const reservedAt = Date.now();
    const login = credentials.login?.trim().toLowerCase();
    if (!login) throw new Error("Live Responses requires the resolved provider account.");
    const capacity = await consume({
      prefix: "bisibility:provider:live-responses",
      bucketKey: providerAccountKey("dataforseo", { ...credentials, login }, { projectId }),
      limit: LIVE_RESPONSE_CAPACITY,
      windowSeconds: LIVE_RESPONSE_WINDOW_SECONDS,
      requireShared: true,
    });
    if (!capacity.success) throw new Error("Live Responses shared capacity is exhausted.");
    const reservation = { dispatchExpiresAt: reservedAt + 5000 };
    assertLiveResponseCapacity(reservation);
    return reservation;
  } catch (cause) {
    throw new ProviderCallError(
      cause instanceof Error ? cause.message : "Live Responses shared capacity is unavailable.",
      0,
    );
  }
}
