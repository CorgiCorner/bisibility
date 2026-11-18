import type { ModelPaymentDatabase } from "./admission-storage";

/** Reuse the caller transaction; never open a nested database transaction. */
export function transactionDatabase(
  tx: Parameters<Parameters<ModelPaymentDatabase["$transaction"]>[0]>[0],
) {
  return {
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as ModelPaymentDatabase;
}
