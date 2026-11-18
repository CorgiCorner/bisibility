import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  MODEL_IN_FLIGHT_MS,
  type ModelAttemptLifecycle,
  type ModelAttemptState,
  modelAttemptState,
} from "./admission-state";
import {
  type ModelAdmissionReason,
  type ModelPaymentQuote,
  modelContentHash,
  modelPaymentQuoteSchema,
} from "./payment";
import { modelUsageDigest } from "./usage";
import { modelUsageBindingSchema } from "./usage-contract";

export type ModelPaymentDatabase = Pick<PrismaClient, "$transaction">;
export type ModelAttempt = ModelAttemptLifecycle & {
  id: string;
  quoteId: string;
  columnId: string;
  namespace: string;
  principal: string;
  binding: import("./usage-contract").ModelUsageBinding;
  dispatched: boolean;
  observed: boolean;
  refusalReason: ModelAdmissionReason | "reservation_unavailable" | null;
  state: ModelAttemptState;
  rootColumnId: string;
  rootQuoteId: string;
};
export async function saveModelPaymentQuote(db: ModelPaymentDatabase, value: ModelPaymentQuote) {
  const quote = modelPaymentQuoteSchema.parse(value);
  if (
    quote.configHash !== modelUsageDigest(quote.context.input) ||
    quote.contentHash !== modelContentHash(quote.context.input) ||
    quote.context.columns.some(
      ({ binding: b }) =>
        b.configHash !== quote.configHash ||
        b.attemptId !== `model:${quote.quoteId}:${b.column.columnId}`,
    )
  )
    throw new Error("Invalid quote hash.");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO model_playground_payment_quotes
      (id,project_id,actor_id,principal,content_hash,snapshot,created_at)
      VALUES(${quote.quoteId},${quote.context.projectId},${quote.context.actorId},${quote.context.principal},
        ${quote.contentHash},${JSON.stringify(quote)}::jsonb,${new Date(quote.createdAt)})`;
  });
  return quote;
}
export async function readModelPaymentQuote(tx: Prisma.TransactionClient, id: string) {
  const [row] = await tx.$queryRaw<
    {
      snapshot: unknown;
      accepted_at: Date | null;
      rejection: ModelAdmissionReason | null;
      replay_of: string | null;
    }[]
  >`SELECT snapshot,accepted_at,rejection,replay_of FROM model_playground_payment_quotes WHERE id=${id} FOR UPDATE`;
  return row
    ? {
        quote: modelPaymentQuoteSchema.parse(row.snapshot),
        accepted: row.accepted_at !== null,
        rejection: row.rejection,
        replayOf: row.replay_of,
      }
    : null;
}
type AttemptRow = {
  id: string;
  quote_id: string;
  column_id: string;
  root_quote_id: string | null;
  root_column_id: string | null;
  namespace: string;
  principal: string;
  binding: unknown;
  dispatched_at: Date | null;
  observed_at: Date | null;
  acknowledged_at: Date | null;
  refusal_reason: ModelAttempt["refusalReason"];
  state: string;
  reservation_expires_at: Date | null;
};
function projectAttempt(row: AttemptRow, now: Date): ModelAttempt {
  const lifecycle = {
    dispatchedAt: row.dispatched_at,
    observedAt: row.observed_at,
    acknowledgedAt: row.acknowledged_at,
    refusalReason: row.refusal_reason,
    reservationState: row.state,
    reservationExpiresAt: row.reservation_expires_at,
  };
  return {
    ...lifecycle,
    id: row.id,
    quoteId: row.quote_id,
    rootQuoteId: row.root_quote_id ?? row.quote_id,
    columnId: row.column_id,
    rootColumnId: row.root_column_id ?? row.column_id,
    namespace: row.namespace,
    principal: row.principal,
    binding: modelUsageBindingSchema.parse(row.binding),
    dispatched: row.dispatched_at !== null,
    observed: row.observed_at !== null,
    state: modelAttemptState(lifecycle, now),
  };
}
export async function readModelAttempts(
  tx: Prisma.TransactionClient,
  quoteId: string,
  now = new Date(),
): Promise<ModelAttempt[]> {
  const rows = await tx.$queryRaw<AttemptRow[]>`
    SELECT a.*,o.state,o.reservation_expires_at FROM model_playground_payment_attempts a
    JOIN metering_operation o ON o.namespace=a.namespace AND o.operation_id=a.id
    WHERE COALESCE(a.root_quote_id,a.quote_id)=${quoteId} AND a.superseded_at IS NULL
    ORDER BY COALESCE(a.root_column_id,a.column_id)`;
  return rows.map((row) => projectAttempt(row, now));
}
export async function readModelAttempt(tx: Prisma.TransactionClient, id: string, now = new Date()) {
  const [row] = await tx.$queryRaw<AttemptRow[]>`
    SELECT a.*,o.state,o.reservation_expires_at FROM model_playground_payment_attempts a
    JOIN metering_operation o ON o.namespace=a.namespace AND o.operation_id=a.id WHERE a.id=${id}`;
  if (!row) throw new Error("Admitted model attempt is unavailable.");
  return projectAttempt(row, now);
}

/** Bound the SQL scan, then use the same lifecycle projection as root liveness and replay. */
export async function readModelInFlightCount(
  tx: Prisma.TransactionClient,
  principal: string,
  now: Date,
) {
  const rows = await tx.$queryRaw<AttemptRow[]>`
    SELECT a.*,o.state,o.reservation_expires_at FROM model_playground_payment_attempts a
    JOIN metering_operation o ON o.namespace=a.namespace AND o.operation_id=a.id
    WHERE a.principal=${principal} AND a.dispatched_at>${new Date(now.getTime() - MODEL_IN_FLIGHT_MS)}
      AND a.observed_at IS NULL`;
  return rows.filter((row) => projectAttempt(row, now).state === "in_flight").length;
}
