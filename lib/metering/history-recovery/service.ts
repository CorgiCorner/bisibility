import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockConnectionAccounting } from "@/lib/metering/store/accounting-lock";
import { currentBudgets, lockScopes, matchingScopes } from "@/lib/metering/store/budgets";
import { canonical, key } from "@/lib/metering/store/codec";
import { createSql, lock } from "@/lib/metering/store/host-sql";
import { createTransactionMeter } from "@/lib/metering/transaction-meter";
import { reconcileSpendingGates } from "@/lib/provider-usage/reconcile-gates";
import { historicalResolutionSchema } from "./manifest";
import { manifestIdentity, planHistoricalResolution } from "./plan";
import { readHistoricalResolutionSnapshot } from "./snapshot";

/** Caller starts a READ ONLY, RepeatableRead transaction and sets the schema. */
export async function previewHistoricalResolution(
  tx: Prisma.TransactionClient,
  value: unknown,
  now = new Date(),
) {
  const manifest = historicalResolutionSchema.parse(value);
  const snapshot = await readHistoricalResolutionSnapshot(tx, manifest, manifestIdentity(manifest));
  return planHistoricalResolution(snapshot, manifest, now);
}

/** Caller owns one atomic transaction. This endpoint has no provider or wallet access. */
export async function applyHistoricalResolution(
  tx: Prisma.TransactionClient,
  value: unknown,
  approvedHash: string,
  now = new Date(),
) {
  const manifest = historicalResolutionSchema.parse(value);
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await sql.verifyTimestampContract();
  await lockConnectionAccounting(sql, manifest.namespace, manifest.connection);
  for (const id of manifest.operations.map((i) => key(manifest.namespace, i.operationId)).sort())
    await lock(sql, `metering:operation:${id}`);
  // Lock the union before taking ANY budget lock, including scopes shared across connections.
  const first = await readHistoricalResolutionSnapshot(tx, manifest, manifestIdentity(manifest));
  const scopes = first.entries.flatMap((e) => matchingScopes(e.operation));
  await lockScopes(sql, scopes);
  const budgets = await currentBudgets(sql, manifest.namespace, scopes);
  const budgetKeys = new Set([
    ...budgets.map((b) => canonical([manifest.namespace, b.id])),
    ...first.entries.flatMap((e) =>
      e.operation.budgetEpochs.map((b) => canonical([manifest.namespace, b.budgetId])),
    ),
  ]);
  for (const id of [...budgetKeys].sort()) await lock(sql, `metering:budget:${id}`);
  const snapshot = await readHistoricalResolutionSnapshot(tx, manifest, manifestIdentity(manifest));
  const plan = planHistoricalResolution(snapshot, manifest, now);
  if (plan.planHash !== approvedHash)
    throw new Error("Preview changed; inspect a fresh preview before applying.");
  if (plan.replayed)
    return { planHash: plan.planHash, replayed: true, resolved: manifest.operations.length };
  const meter = await createTransactionMeter(tx, { now: () => now });
  for (const correction of plan.corrections) {
    const result = await meter.correct(correction);
    if (result.outcome !== "settled" || result.operation.state !== "settled")
      throw new Error("Historical correction refused; the entire batch will roll back.");
  }
  // A remaining unknown in ANY operation keeps its shared gate closed.
  for (const entry of snapshot.entries) await reconcileSpendingGates(tx, entry.operation);
  return { planHash: plan.planHash, replayed: false, resolved: plan.corrections.length };
}
