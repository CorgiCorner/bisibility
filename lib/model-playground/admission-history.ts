import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { MODEL_IN_FLIGHT_MS } from "./admission-state";
import type { ModelPaymentQuote } from "./payment";

/** Only unobserved, unacknowledged stale dispatches need a new confirmation. */
export async function readModelUnconfirmedAttempts(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
  now = new Date(),
) {
  const rows = await tx.$queryRaw<
    { id: string; dispatched_at: Date; acknowledged_at: Date | null }[]
  >`
    SELECT a.id,a.dispatched_at,a.acknowledged_at FROM model_playground_payment_attempts a
    JOIN model_playground_payment_quotes q ON q.id=a.quote_id
    WHERE q.project_id=${quote.context.projectId} AND q.actor_id=${quote.context.actorId}
      AND q.content_hash=${quote.contentHash}
      AND a.dispatched_at IS NOT NULL AND a.observed_at IS NULL ORDER BY a.id`;
  return {
    contentHash: quote.contentHash,
    attemptIds: rows
      .filter(
        (a) =>
          !a.acknowledged_at && a.dispatched_at.getTime() + MODEL_IN_FLIGHT_MS <= now.getTime(),
      )
      .map((a) => a.id),
    earlierAttemptUnconfirmed: rows.length > 0,
  };
}
