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

/** Accounting failures must never trigger another paid provider request. */
export class ProviderUsagePersistenceError extends Error {
  constructor(options?: ErrorOptions) {
    super("Provider usage could not be confirmed. Reconcile the request before retrying.", options);
    this.name = "ProviderUsagePersistenceError";
  }
}

export async function readObservedResponse<T>(input: {
  observer?: ProviderUsageObserver;
  request: () => Promise<Response>;
  measure: (data: T | null, response: Response) => ProviderUsageReceipt;
}) {
  const attemptId = await input.observer?.begin();
  let response: Response;
  try {
    response = await input.request();
  } catch (error) {
    if (attemptId && input.observer) {
      await input.observer.settle(attemptId, {
        cached: false,
        costCents: null,
        failed: true,
        quantity: null,
      });
      throw new ProviderUsagePersistenceError({ cause: error });
    }
    throw error;
  }
  let data: T | null;
  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }
  if (attemptId && input.observer) {
    const receipt = input.measure(data, response);
    await input.observer.settle(attemptId, receipt);
    if (receipt.costCents === null || receipt.quantity === null)
      throw new ProviderUsagePersistenceError();
  }
  return { data, response };
}
