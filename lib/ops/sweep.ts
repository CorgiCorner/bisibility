import { getOpsConfig } from "@/lib/ops/config";
import { deliverPersistedOpsEvent } from "@/lib/ops/notify";
import { redactOpsText } from "@/lib/ops/slack";

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_ATTEMPTS = 5;

export async function sweepUndeliveredOpsEvents(
  options: { limit?: number; maxAttempts?: number } = {},
) {
  if (!getOpsConfig().enabled) return { attempted: 0, delivered: 0, committed: false };
  let attempted = 0;
  let delivered = 0;
  let committed = false;
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
    attempted = events.length;
    for (const event of events) {
      const result = await deliverPersistedOpsEvent(event);
      if (result.delivered) delivered += 1;
      committed ||= result.delivered || result.committed;
    }
    return { attempted, delivered, committed };
  } catch (error) {
    console.error(`[ops] outbox sweep failed: ${redactOpsText(error)}`);
    return { attempted, delivered, committed };
  }
}
