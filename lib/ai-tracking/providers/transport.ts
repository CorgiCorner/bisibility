import { readBodyWithLimit } from "@/lib/http/bounded-body";
import { assertLiveResponseCapacity } from "@/lib/providers/live-capacity";
import { requireDataForSeoLogin } from "@/lib/providers/serp/dataforseo-client";
import type { ProviderCredentials } from "@/lib/providers/types";
import { assertTrackingDeadline, TrackingDispatchDeniedError } from "./dispatch-error";
import type { TrackingEnvelope } from "./envelope";
import { admitTrackingRequest } from "./request-admission";

export class TrackingTransportError extends Error {
  constructor(
    readonly kind: "http" | "envelope",
    readonly status: number,
  ) {
    super(`Tracking provider ${kind} failure (${status}).`);
  }
}
export async function trackingTransport(input: {
  endpoint: string;
  credentials: ProviderCredentials;
  payload?: Record<string, unknown>;
  deadline: string;
  projectId?: string;
  request?: typeof fetch;
}) {
  let authorization: string;
  let body: string | undefined;
  try {
    authorization = requireDataForSeoLogin(input.credentials);
    body = input.payload ? JSON.stringify([input.payload]) : undefined;
  } catch (cause) {
    throw new TrackingDispatchDeniedError(cause);
  }
  const reservation = await admitTrackingRequest({
    credentials: input.credentials,
    projectId: input.projectId,
    deadline: input.deadline,
    liveResponses: Boolean(input.payload && input.endpoint.endsWith("/llm_responses/live")),
  });
  if (reservation) {
    try {
      assertLiveResponseCapacity(reservation);
    } catch (cause) {
      throw new TrackingDispatchDeniedError(cause);
    }
  }
  const remaining = assertTrackingDeadline(input.deadline);
  const response = await (input.request ?? fetch)(
    `https://api.dataforseo.com/v3/${input.endpoint}`,
    {
      method: input.payload ? "POST" : "GET",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      ...(body ? { body } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(Math.min(120_000, remaining)),
    },
  );
  const responseBody = await readBodyWithLimit(response, 4 * 1024 * 1024);
  if (!responseBody.ok)
    throw new Error("Tracking provider response exceeds its bound or is unreadable.");
  const envelope = JSON.parse(responseBody.bytes.toString("utf8")) as TrackingEnvelope;
  if (!response.ok) throw new TrackingTransportError("http", response.status);
  return envelope;
}
