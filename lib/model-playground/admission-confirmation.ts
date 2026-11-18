import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ModelRunConsent } from "./admission";
import { modelRootIsLive } from "./admission-state";
import { readModelAttempts } from "./admission-storage";
import type { ModelPaymentQuote } from "./payment";

export function modelSameAttemptSet(a: string[], b: string[]) {
  const set = new Set(a);
  return set.size === a.length && a.length === b.length && b.every((id) => set.has(id));
}

export async function readModelConfirmation(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
  input: ModelRunConsent,
) {
  const confirmation = input.confirmUnknown;
  if (!confirmation || confirmation.contentHash !== quote.contentHash) return null;
  const [row] = await tx.$queryRaw<
    {
      nonce: string;
      attempt_ids: string[];
      consumed_root_quote_id: string | null;
    }[]
  >`SELECT nonce,attempt_ids,consumed_root_quote_id FROM model_playground_payment_confirmations
    WHERE nonce=${confirmation.nonce} AND project_id=${quote.context.projectId}
      AND actor_id=${quote.context.actorId} AND content_hash=${quote.contentHash} FOR UPDATE`;
  return row && modelSameAttemptSet(row.attempt_ids, confirmation.attemptIds) ? row : null;
}

export async function issueModelConfirmation(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
  attemptIds: string[],
  now: Date,
) {
  const nonce = randomUUID();
  await tx.$executeRaw`INSERT INTO model_playground_payment_confirmations(nonce,project_id,actor_id,content_hash,attempt_ids,created_at)
    VALUES(${nonce},${quote.context.projectId},${quote.context.actorId},${quote.contentHash},${JSON.stringify(attemptIds)}::jsonb,${now})`;
  return {
    kind: "confirmation_required" as const,
    nonce,
    contentHash: quote.contentHash,
    attemptIds,
    earlierAttemptUnconfirmed: true as const,
  };
}

export async function modelRoot(tx: Prisma.TransactionClient, rootId: string, now: Date) {
  const [root] = await tx.$queryRaw<{ snapshot: unknown; accepted_at: Date | null }[]>`
    SELECT snapshot,accepted_at FROM model_playground_payment_quotes WHERE id=${rootId}`;
  const attempts = await readModelAttempts(tx, rootId, now);
  return {
    quote: root.snapshot as ModelPaymentQuote,
    attempts,
    live: root.accepted_at !== null && modelRootIsLive(root.accepted_at, attempts, now),
  };
}

/** Called after all replacement reservations succeed, in the same host transaction. */
export async function consumeModelConfirmation(
  tx: Prisma.TransactionClient,
  nonce: string,
  quoteId: string,
  now: Date,
) {
  const [confirmation] = await tx.$queryRaw<{ attempt_ids: string[] }[]>`
    UPDATE model_playground_payment_confirmations SET consumed_at=${now},consumed_root_quote_id=${quoteId}
      WHERE nonce=${nonce} AND consumed_at IS NULL RETURNING attempt_ids`;
  if (!confirmation) throw new Error("Model confirmation consumption lost its lock.");
  for (const id of confirmation.attempt_ids)
    await tx.$executeRaw`UPDATE model_playground_payment_attempts SET acknowledged_at=${now}
      WHERE id=${id} AND observed_at IS NULL AND acknowledged_at IS NULL`;
}
