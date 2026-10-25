import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notificationTransaction, queueNotificationEvent } from "./transaction";

/** Withdrawal is idempotent and cannot resurrect a row through a stale update. */
export async function withdrawNotification(
  input: { userId: string; idempotencyKey: string },
  transaction?: Prisma.TransactionClient,
) {
  const persist = async (tx: Prisma.TransactionClient) => {
    const rows = await tx.notification.updateManyAndReturn({
      where: { ...input, withdrawnAt: null },
      data: { withdrawnAt: new Date(), version: { increment: 1 } },
    });
    for (const row of rows)
      queueNotificationEvent(tx, {
        id: row.id,
        userId: row.userId,
        projectId: row.projectId,
        createdAt: row.createdAt.toISOString(),
        kind: "withdrawn",
      });
    return rows.length;
  };
  return transaction ? persist(transaction) : notificationTransaction(persist);
}
