import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { syncUsageEntry } from "@/lib/metering/entry-sync";
import { recordUnchargedEvidence } from "@/lib/metering/uncharged-evidence";
import type { ProviderUsageReconcileClient } from "./reconcile";

type PendingUnknownReceiptRow = {
  accounted: boolean;
  connectionId: string;
  costCents: string | null;
  entryId: string;
  providerRequestId: string;
};

/**
 * Pending unknown journal rows whose queued task later became trusted: the task carries a
 * native provider id, and either its known charge can settle the pending row in place or a
 * native ledger row already accounts the charge and the pending row is a phantom duplicate.
 */
export async function pendingUnknownReceipts(
  client: ProviderUsageReconcileClient,
  fetchLimit: number,
) {
  return client.$queryRaw<PendingUnknownReceiptRow[]>(Prisma.sql`
    SELECT
      EXISTS(
        SELECT 1
        FROM "provider_cost_entries" accounted
        WHERE accounted."connectionId" = e."connectionId"
          AND accounted."providerRequestId" = t."providerTaskId"
          AND accounted."id" <> e."id"
      ) AS "accounted",
      e."connectionId" AS "connectionId",
      t."costCents" AS "costCents",
      e."id" AS "entryId",
      t."providerTaskId" AS "providerRequestId"
    FROM "provider_cost_entries" e
    JOIN "queued_rank_check_tasks" t ON t."id" = e."correlationId"
    JOIN "queued_rank_check_batches" b ON b."id" = t."batchId"
    WHERE e."measurementStatus" = 'unknown'
      AND e."feature" = 'rank_check'
      AND e."connectionId" = b."connectionId"
      AND e."projectId" = b."projectId"
      AND t."providerTaskId" IS NOT NULL
      AND (
        t."costCents" IS NOT NULL
        OR EXISTS(
          SELECT 1
          FROM "provider_cost_entries" accounted
          WHERE accounted."connectionId" = e."connectionId"
            AND accounted."measurementStatus" = 'recorded'
            AND accounted."providerRequestId" = t."providerTaskId"
            AND accounted."id" <> e."id"
        )
      )
    ORDER BY e."createdAt" ASC, e."id" ASC
    LIMIT ${fetchLimit}
  `);
}

function isPrismaErrorCode(error: unknown, code: string) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

/** Settle one pending row by trusted task correlation, never double counting a native receipt. */
export async function settlePendingUnknownReceipt(
  client: ProviderUsageReconcileClient,
  row: PendingUnknownReceiptRow,
) {
  const costCents = row.costCents === null ? null : Number(row.costCents);
  const knownCost =
    costCents !== null && Number.isFinite(costCents) && costCents >= 0 ? costCents : null;
  if (row.accounted) return settleNativeDuplicate(client, row, knownCost);
  if (knownCost === null) return false;
  try {
    // Update in place so the original billing timestamp is preserved, never backfilled.
    await client.providerCostEntry.update({
      where: { id: row.entryId, measurementStatus: "unknown" },
      data: {
        cached: false,
        costCents: knownCost,
        failed: false,
        measurementStatus: "recorded",
        providerRequestId: row.providerRequestId,
        usageQuantity: 1,
      },
    });
  } catch (error) {
    if (isPrismaErrorCode(error, "P2025")) return false;
    if (!isPrismaErrorCode(error, "P2002")) throw error;
    return settleNativeDuplicate(client, row, knownCost);
  }
  await syncUsageEntry(row.entryId);
  return true;
}

async function settleNativeDuplicate(
  client: ProviderUsageReconcileClient,
  row: PendingUnknownReceiptRow,
  knownCost: number | null,
) {
  const native = await client.providerCostEntry.findFirst({
    where: {
      connectionId: row.connectionId,
      providerRequestId: row.providerRequestId,
      id: { not: row.entryId },
    },
    select: { id: true, measurementStatus: true },
  });
  if (!native) return false;
  if (native.measurementStatus !== "recorded") {
    if (knownCost === null) return false;
    try {
      await client.providerCostEntry.update({
        where: { id: native.id, measurementStatus: "unknown" },
        data: {
          costCents: knownCost,
          usageQuantity: 1,
          measurementStatus: "recorded",
          cached: false,
          failed: false,
        },
      });
    } catch (error) {
      if (isPrismaErrorCode(error, "P2025")) return false;
      throw error;
    }
  }
  await client.providerCostEntry.deleteMany({
    where: { id: row.entryId, measurementStatus: "unknown" },
  });
  await syncUsageEntry(native.id);
  await recordUnchargedEvidence(row.entryId);
  return true;
}
