import type { Prisma } from "@/lib/generated/prisma/client";

/** Deployment-specific cleanup inside the account deletion transaction. */
export async function onAccountDeletion(
  _tx: Prisma.TransactionClient,
  _userId: string,
  _now: Date,
): Promise<void> {}
