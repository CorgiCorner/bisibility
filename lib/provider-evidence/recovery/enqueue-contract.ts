import type { Prisma, ProviderRecoveryIntent } from "@/lib/generated/prisma/client";

export type RecoveryEnqueued = Pick<
  ProviderRecoveryIntent,
  "id" | "operationPk" | "attemptId" | "accountingOnly"
>;
// Incident creation shares the enqueue transaction; tests may inject a read-only observer.
export type OnRecoveryEnqueued = (
  tx: Prisma.TransactionClient,
  event: RecoveryEnqueued,
) => Promise<void>;
