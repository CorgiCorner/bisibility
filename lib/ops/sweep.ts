import { getOpsConfig } from "@/lib/ops/config";
import { deliverPersistedOpsEvent } from "@/lib/ops/notify";
import { redactOpsText } from "@/lib/ops/slack";

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_ATTEMPTS = 5;

export async function sweepUndeliveredOpsEvents(
  options: { limit?: number; maxAttempts?: number } = {},
) {
  if (!getOpsConfig().enabled) return { attempted: 0, delivered: 0 };
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const events = await prisma.opsEvent.findMany({
      orderBy: { createdAt: "asc" },
      take: Math.max(1, options.limit ?? DEFAULT_LIMIT),
      where: {
        attempts: { lt: Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS) },
        deliveredAt: null,
      },
    });
    let delivered = 0;
    for (const event of events) {
      if (await deliverPersistedOpsEvent(event)) delivered += 1;
    }
    return { attempted: events.length, delivered };
  } catch (error) {
    console.error(`[ops] outbox sweep failed: ${redactOpsText(error)}`);
    return { attempted: 0, delivered: 0 };
  }
}
