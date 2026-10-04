export type ProviderUsageReceipt = {
  cached: boolean;
  costCents: number | null;
  failed: boolean;
  providerRequestId?: string;
  quantity: number | null;
};

export type ProviderUsageObserver = {
  begin(): Promise<string>;
  settle(attemptId: string, receipt: ProviderUsageReceipt): Promise<void>;
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
  measure: (data: T | null, response: Response) => ProviderUsageReceipt;
  requireMeasuredUsage?: boolean;
}) {
  let attemptId: string | undefined;
  try {
    attemptId = await input.observer?.begin();
  } catch (cause) {
    throw new ProviderUsagePersistenceError({
      cause,
      phase: "admission",
      attemptId: cause instanceof ProviderUsagePersistenceError ? cause.attemptId : undefined,
    });
  }
  let response: Response;
  try {
    response = await input.request();
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
