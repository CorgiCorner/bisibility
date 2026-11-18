import "server-only";
import { lockResourceOwners } from "@/lib/capacity/resource-lock";
import { ModelDispatchRefusal } from "@/lib/provider-usage/model-dispatch";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { refuseModelAttempt } from "./admission-refusal";
import {
  type ModelAttempt,
  type ModelPaymentDatabase,
  readModelAttempt,
} from "./admission-storage";
import { requireModelColumnTransition, storedColumnPhase } from "./column-state";
import { ModelAdmissionRefusal } from "./payment";
import { modelPaymentTransaction } from "./payment-transaction";
import { fitModelResult } from "./result-budget";
import { transactionDatabase } from "./runtime-transaction";
import { modelPlaygroundSqlNow } from "./sql-clock";
import { isModelStorageBusy } from "./storage-busy";
import { createModelPlaygroundStore } from "./store";
import { queryRows } from "./store-db";
import { completeModelRunColumn } from "./store-terminal";
import { type ModelColumnResult, modelColumnResultSchema } from "./types";

type Identity = { projectId: string; runId: string; columnId: string };
/** The lease belongs to storage, not to a local variable that may be lost after a paid response. */
export async function finishModelColumn(
  db: ModelPaymentDatabase,
  identity: Identity,
  result: ModelColumnResult,
) {
  return completeModelRunColumn(db, identity, async (tx) => {
    const store = createModelPlaygroundStore({ $transaction: async (work) => work(tx) });
    const column = (await store.read(identity.projectId, identity.runId)).columns.find(
      (c) => c.columnId === identity.columnId,
    );
    if (column?.result) return false;
    if (column && result.failure === "refused" && !column.dispatchStartedAt) {
      requireModelColumnTransition("refused", storedColumnPhase(column), "fail");
      const rows = await queryRows<{ id: string }>(
        tx,
        `UPDATE model_playground_columns c
        SET state='cancelled',result=$4::jsonb,"finishedAt"=(clock_timestamp() AT TIME ZONE 'UTC')
        FROM model_playground_runs r,model_playground_payment_attempts a
        WHERE c."projectId"=$1 AND c."runId"=$2 AND c."columnId"=$3
          AND r.id=c."runId" AND r."projectId"=c."projectId"
          AND COALESCE(a.root_quote_id,a.quote_id)=r."previewId"
          AND COALESCE(a.root_column_id,a.column_id)=c."columnId" AND a.superseded_at IS NULL
          AND a.dispatched_at IS NULL AND a.refusal_reason IS NOT NULL
          AND c.config=$5::jsonb
          AND c.result IS NULL AND c."dispatchStartedAt" IS NULL RETURNING c.id`,
        identity.projectId,
        identity.runId,
        identity.columnId,
        JSON.stringify(result),
        JSON.stringify(result.column),
      );
      if (!rows.length) throw new Error("Column refusal unavailable");
      return true;
    }
    const claimed =
      column?.state === "queued"
        ? await store.claim({ ...identity, leaseSeconds: 180 }, "cancel")
        : column;
    if (!claimed?.leaseToken) throw new Error("Column lease unavailable");
    requireModelColumnTransition(
      result.failure === "refused" ? "refused" : "in_flight",
      storedColumnPhase(claimed),
      ["completed", "partial"].includes(result.state) ? "complete" : "fail",
    );
    await store.complete({ ...identity, leaseToken: claimed.leaseToken }, result);
    return true;
  });
}

/** Return full evidence to the caller; fit only the durable copy. */
export function persistedModelResult(result: ModelColumnResult): ModelColumnResult {
  return modelColumnResultSchema.parse(fitModelResult(result));
}

export async function refuseUnstartedModelColumn(
  db: ModelPaymentDatabase,
  identity: Identity,
  attempt: ModelAttempt,
  reason: NonNullable<ModelAttempt["refusalReason"]>,
) {
  const now = await modelPlaygroundSqlNow(db);
  const current = await refuseUnstartedModelAttempt(db, attempt, reason);
  if (current.dispatched) return { attemptId: attempt.id, state: "already_dispatched" as const };
  const result: ModelColumnResult = {
    ...transportEvidence({ ...attempt.binding.column, columnId: identity.columnId }, +now, null),
    state: "cancelled",
    failure: "refused",
    finishedAt: now.toISOString(),
    durationMs: 0,
  };
  const finalizeReport = await finishModelColumn(db, identity, result).catch(() => false);
  return {
    attemptId: attempt.id,
    state: "refused" as const,
    reason: current.refusalReason ?? reason,
    result,
    finalizeReport,
  };
}

export async function refuseUnstartedModelAttempt(
  db: ModelPaymentDatabase,
  attempt: ModelAttempt,
  reason: NonNullable<ModelAttempt["refusalReason"]>,
  _now?: Date,
) {
  return db.$transaction(async (tx) => {
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const now = clock.now;
    await lockResourceOwners(tx, [attempt.principal]);
    const current = await readModelAttempt(tx, attempt.id, now);
    if (!current.dispatched && !current.refusalReason) {
      const [column] = await tx.$queryRaw<
        { state: string; dispatchStartedAt: Date | null; result: unknown }[]
      >`
        SELECT c.state,c."dispatchStartedAt",c.result FROM model_playground_columns c
        JOIN model_playground_runs r ON r.id=c."runId" AND r."projectId"=c."projectId"
        WHERE r."previewId"=${current.rootQuoteId} AND c."columnId"=${current.rootColumnId}
          AND c."projectId"=${current.binding.projectId}`;
      requireModelColumnTransition(
        current.state,
        column ? storedColumnPhase(column) : "queued",
        "refuse",
      );
      await refuseModelAttempt(tx, current, reason, now);
    }
    return readModelAttempt(tx, attempt.id, now);
  });
}

/** One transaction rolls back both the claim and fence if the admission mark refuses. */
export async function claimModelDispatch(
  db: ModelPaymentDatabase,
  identity: Identity,
  attemptId: string,
  mark: (db: ModelPaymentDatabase) => Promise<void>,
) {
  try {
    await modelPaymentTransaction(db, async (tx) => {
      const [run] = await tx.$queryRaw<
        { recoveryStoppedAt: Date | null }[]
      >`SELECT "recoveryStoppedAt"
        FROM model_playground_runs WHERE id=${identity.runId} AND "projectId"=${identity.projectId} FOR SHARE`;
      if (run?.recoveryStoppedAt) throw new ModelDispatchRefusal("reservation_unavailable");
      const bound = transactionDatabase(tx);
      const store = createModelPlaygroundStore(bound);
      const attempt = await readModelAttempt(tx, attemptId);
      if (attempt.dispatched) throw new ModelDispatchRefusal("already_dispatched");
      if (attempt.refusalReason) throw new ModelDispatchRefusal(attempt.refusalReason);
      const persisted = (await store.read(identity.projectId, identity.runId)).columns.find(
        (c) => c.columnId === identity.columnId,
      );
      if (!persisted) throw new ModelDispatchRefusal("reservation_unavailable");
      requireModelColumnTransition(attempt.state, storedColumnPhase(persisted), "claim");
      const column = await store.claim({ ...identity, leaseSeconds: 180 });
      if (!column) throw new ModelDispatchRefusal("reservation_unavailable");
      requireModelColumnTransition(attempt.state, storedColumnPhase(column), "fence");
      const fenced = await store.fenceDispatch({ ...identity, leaseToken: column.leaseToken });
      requireModelColumnTransition(attempt.state, storedColumnPhase(fenced), "dispatch");
      await mark(bound);
    });
  } catch (error) {
    if (isModelStorageBusy(error)) throw new ModelDispatchRefusal("storage_busy");
    const reason = modelRefusalReason(error);
    // The failed claim transaction rolled back the journal's cancellation too.
    if (reason) {
      const attempt = await db.$transaction((tx) => readModelAttempt(tx, attemptId));
      await refuseUnstartedModelAttempt(db, attempt, reason);
    }
    throw error;
  }
}

export function modelRefusalReason(error: unknown): ModelAttempt["refusalReason"] {
  if (error instanceof ModelAdmissionRefusal) return error.reason;
  if (!(error instanceof ModelDispatchRefusal)) return null;
  const reason = error.reason;
  return reason === "already_dispatched" ||
    reason === "account_concurrency" ||
    reason === "storage_busy"
    ? null
    : reason;
}
