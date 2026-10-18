import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { deleteServerPersons, shouldQueueAnalyticsPersonDeletion } from "./deletion-provider";
import { resolveAnalyticsProvider } from "./provider";

export async function queueAnalyticsPersonDeletion(
  tx: Prisma.TransactionClient,
  user: { id: string; publicId: string },
) {
  if (!shouldQueueAnalyticsPersonDeletion()) return;
  // Include the legacy web identity while the account switches to its public ID.
  await tx.analyticsPersonDeletion.createMany({
    data: [user.id, user.publicId].map((distinctId) => ({ distinctId })),
    skipDuplicates: true,
  });
}

export async function flushAnalyticsPersonDeletions(): Promise<void> {
  const provider = resolveAnalyticsProvider(process.env);
  if (provider !== "posthog") return;
  try {
    const rows = await prisma.analyticsPersonDeletion.findMany({
      where: {
        OR: [
          { lastAttemptAt: null },
          { lastAttemptAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
        ],
      },
      orderBy: [{ lastAttemptAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: 100,
    });
    if (!rows.length) return;
    const distinctIds = rows.map(({ distinctId }) => distinctId);
    await prisma.analyticsPersonDeletion.updateMany({
      where: { distinctId: { in: distinctIds } },
      data: { lastAttemptAt: new Date() },
    });
    if (await deleteServerPersons(distinctIds)) {
      await prisma.analyticsPersonDeletion.deleteMany({
        where: { distinctId: { in: distinctIds } },
      });
    } else {
      console.warn("[analytics deletion] delivery unacknowledged; requests retained", rows.length);
    }
  } catch {
    // The durable queue remains available for the next maintenance pass.
  }
}
