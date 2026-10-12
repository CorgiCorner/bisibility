import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import type { PricedRequest, ProviderRequest } from "@usagekit/providers";
import { ProviderCostLimitError } from "./cost-limit";
import { DeploymentAdmissionExhaustedError } from "./execution-extension-errors";

export type ProviderUsageReceipt = {
  cached: boolean;
  costCents: number | null;
  failed: boolean;
  providerRequestId?: string;
  quantity: number | null;
};

export type ProviderUsageObserver = {
  begin(input?: { attemptKey: string }): Promise<string>;
  prepare?(input: { attemptKey: string; request: ProviderRequest }): Promise<{
    attemptId: string;
    request: PricedRequest;
  }>;
  settle(attemptId: string, receipt: ProviderUsageReceipt): Promise<void>;
  beforeDispatch?(attemptId: string): Promise<void>;
  cancel?(attemptId: string): Promise<void>;
};

export type ProviderUsageFailurePhase =
  | "admission"
  | "request"
  | "response_body"
  | "measurement"
  | "settlement"
  | "unknown";

/** Accounting failures must never trigger another paid provider request. */
export class ProviderUsagePersistenceError extends Error {
  readonly phase: ProviderUsageFailurePhase;
  readonly attemptId?: string;

  constructor(options?: ErrorOptions & { phase?: ProviderUsageFailurePhase; attemptId?: string }) {
    super("Provider usage could not be confirmed. Reconcile the request before retrying.", options);
    this.name = "ProviderUsagePersistenceError";
    this.phase = options?.phase ?? "unknown";
    this.attemptId = options?.attemptId;
  }
}

async function settleUsage(
  observer: ProviderUsageObserver | undefined,
  attemptId: string | undefined,
  receipt: ProviderUsageReceipt,
) {
  if (!observer || !attemptId) return;
  try {
    await observer.settle(attemptId, receipt);
  } catch (cause) {
    throw new ProviderUsagePersistenceError({ cause, phase: "settlement", attemptId });
  }
}

export async function readObservedResponse<T>(input: {
  observer?: ProviderUsageObserver;
  request: () => Promise<Response>;
  providerRequest?: ProviderRequest;
  dispatch?: (request: PricedRequest) => Promise<Response>;
  measure: (data: T | null, response: Response) => ProviderUsageReceipt;
  requireMeasuredUsage?: boolean;
  // A synchronous producer fence after native admission and immediately before I/O.
  beforeRequest?: () => void;
}) {
  if (input.requireMeasuredUsage && !input.observer)
    throw new ProviderUsagePersistenceError({
      phase: "admission",
      cause: new Error("Billable transport requires an accounting observer"),
    });
  let attemptId: string | undefined;
  let pricedRequest: PricedRequest | undefined;
  // Copy before admission can yield, including while waiting for another journal begin.
  const snapshot = input.providerRequest && structuredClone(input.providerRequest);
  // One identity exists before accounting starts; a new paid request gets a new identity.
  const attemptKey = crypto.randomUUID();
  try {
    if (snapshot && input.observer?.prepare) {
      if (!input.dispatch) throw new Error("Priced transport dispatch is unavailable");
      const prepared = await input.observer.prepare({ attemptKey, request: snapshot });
      attemptId = prepared.attemptId;
      pricedRequest = prepared.request;
    } else {
      attemptId = await input.observer?.begin({ attemptKey });
    }
    if (attemptId) await input.observer?.beforeDispatch?.(attemptId);
  } catch (cause) {
    if (attemptId) await input.observer?.cancel?.(attemptId);
    if (
      cause instanceof ProviderCostLimitError ||
      cause instanceof DeploymentAdmissionExhaustedError ||
      cause instanceof BudgetExhaustedError ||
      cause instanceof ProviderAllocationExhaustedError
    )
      throw cause;
    throw new ProviderUsagePersistenceError({
      cause,
      phase: "admission",
      attemptId: cause instanceof ProviderUsagePersistenceError ? cause.attemptId : undefined,
    });
  }
  try {
    input.beforeRequest?.();
  } catch (cause) {
    await settleUsage(input.observer, attemptId, {
      cached: false,
      costCents: 0,
      failed: true,
      quantity: 0,
    });
    throw cause;
  }
  let response: Response;
  try {
    response =
      pricedRequest && input.dispatch ? await input.dispatch(pricedRequest) : await input.request();
  } catch (cause) {
    if (attemptId && input.observer) {
      await settleUsage(input.observer, attemptId, {
        cached: false,
        costCents: null,
        failed: true,
        quantity: null,
      });
      throw new ProviderUsagePersistenceError({ cause, phase: "request", attemptId });
    }
    throw cause;
  }
  let data: T | null = null;
  let bodyFailure: unknown;
  try {
    data = (await response.json()) as T;
  } catch (cause) {
    bodyFailure = cause;
  }
  if (!attemptId && !input.requireMeasuredUsage) return { data, response };
  let receipt: ProviderUsageReceipt;
  try {
    receipt = input.measure(data, response);
  } catch (cause) {
    await settleUsage(input.observer, attemptId, {
      cached: false,
      costCents: null,
      failed: true,
      quantity: null,
    });
    throw new ProviderUsagePersistenceError({ cause, phase: "measurement", attemptId });
  }
  await settleUsage(input.observer, attemptId, receipt);
  if (
    (attemptId || input.requireMeasuredUsage) &&
    (receipt.costCents === null || receipt.quantity === null)
  ) {
    throw new ProviderUsagePersistenceError({
      cause: bodyFailure,
      phase: bodyFailure ? "response_body" : "measurement",
      attemptId,
    });
  }
  return { data, response };
}
