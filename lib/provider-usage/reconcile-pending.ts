import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { syncUsageEntry } from "@/lib/metering/entry-sync";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import { recordByokEvidence } from "./byok-evidence";
import type { ProviderUsageReconcileClient } from "./reconcile";
import { type ProviderUsageRecordInput, recordProviderUsage } from "./recorder";

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
          AND accounted."credentialSource" = 'own'
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
      AND e."credentialSource" = 'own'
      AND t."providerTag" LIKE '%;cs=own;%'
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
            AND accounted."credentialSource" = 'own'
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

function knownAmount(value: string | number | null) {
  const amount = value === null ? null : Number(value);
  return amount !== null && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

async function lockEvidence(tx: Prisma.TransactionClient, ids: string[]) {
  const orderedIds = [...new Set(ids)].sort();
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "metering_usage_evidence"
    WHERE "id" IN (${Prisma.join(orderedIds)}) ORDER BY "id" FOR UPDATE
  `);
}

/** Update only a verified pre-I/O journal. Legacy repair cannot assign today's owner. */
async function recordExisting(
  tx: Prisma.TransactionClient,
  id: string,
  connectionId: string,
  receipt: ProviderUsageReceipt,
  canonicalId: string | null,
) {
  const evidence = await tx.meteringUsageEvidence.findUnique({ where: { id } });
  if (!evidence || evidence.discarded) return;
  if (evidence.connectionId !== connectionId) throw new Error("Retained BYOK connection changed.");
  await recordByokEvidence(tx, id, receipt, canonicalId);
}

function queuedReceipt(costCents: number | null, providerRequestId: string): ProviderUsageReceipt {
  return { cached: false, failed: false, costCents, quantity: 1, providerRequestId };
}

async function settleNativeDuplicate(
  tx: Prisma.TransactionClient,
  row: PendingUnknownReceiptRow,
  knownCost: number | null,
): Promise<string[] | null> {
  const query = {
    where: {
      connectionId: row.connectionId,
      credentialSource: "own",
      providerRequestId: row.providerRequestId,
      id: { not: row.entryId },
    },
    select: {
      id: true,
      measurementStatus: true,
      costCents: true,
      usageQuantity: true,
      cached: true,
      failed: true,
    },
  } as const;
  let native = await tx.providerCostEntry.findFirst(query);
  if (!native) return null;
  const nativeId = native.id;
  await lockEvidence(tx, [nativeId, row.entryId]);
  native = await tx.providerCostEntry.findFirst(query);
  if (!native || native.id !== nativeId) return null;
  let receipt: ProviderUsageReceipt = {
    cached: native.cached,
    failed: native.failed,
    costCents: Number(native.costCents),
    quantity: native.usageQuantity === null ? null : Number(native.usageQuantity),
    providerRequestId: row.providerRequestId,
  };
  if (native.measurementStatus !== "recorded") {
    if (knownCost === null) return null;
    receipt = queuedReceipt(knownCost, row.providerRequestId);
    await tx.providerCostEntry.update({
      where: { id: native.id, measurementStatus: "unknown" },
      data: {
        costCents: knownCost,
        usageQuantity: 1,
        measurementStatus: "recorded",
        cached: false,
        failed: false,
      },
    });
  }
  await recordExisting(tx, native.id, row.connectionId, receipt, null);
  await recordExisting(tx, row.entryId, row.connectionId, receipt, native.id);
  await tx.providerCostEntry.deleteMany({
    where: { id: row.entryId, measurementStatus: "unknown" },
  });
  return [native.id, row.entryId];
}

async function settleInTransaction(
  tx: Prisma.TransactionClient,
  row: PendingUnknownReceiptRow,
  knownCost: number | null,
): Promise<string[] | null> {
  if (row.accounted) return settleNativeDuplicate(tx, row, knownCost);
  if (knownCost === null) return null;
  await lockEvidence(tx, [row.entryId]);
  // The core projection and immutable-owner proof commit together; failures remain retryable.
  await tx.providerCostEntry.update({
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
  await recordExisting(
    tx,
    row.entryId,
    row.connectionId,
    queuedReceipt(knownCost, row.providerRequestId),
    null,
  );
  return [row.entryId];
}

/** Settle by trusted task correlation. A unique-conflict retry uses a fresh transaction. */
export async function settlePendingUnknownReceipt(
  client: ProviderUsageReconcileClient,
  row: PendingUnknownReceiptRow,
) {
  const knownCost = knownAmount(row.costCents);
  let ids: string[] | null;
  try {
    ids = await client.$transaction((tx) => settleInTransaction(tx, row, knownCost));
  } catch (error) {
    if (isPrismaErrorCode(error, "P2025")) return false;
    if (!isPrismaErrorCode(error, "P2002")) throw error;
    ids = await client.$transaction((tx) => settleNativeDuplicate(tx, row, knownCost));
  }
  if (!ids) return false;
  for (const id of ids) await syncUsageEntry(id);
  return true;
}

/** A missing core projection may reuse its retained id, but never mint a new accounting owner. */
export async function repairMissingByokReceipt(
  client: ProviderUsageReconcileClient,
  entryId: string,
  input: ProviderUsageRecordInput,
) {
  const ids = await client.$transaction(async (tx) => {
    const evidence = await tx.meteringUsageEvidence.findUnique({ where: { id: entryId } });
    if (
      !evidence ||
      evidence.discarded ||
      evidence.connectionId !== input.connectionId ||
      evidence.correlationId !== input.attribution.context.correlationId ||
      evidence.projectId !== input.attribution.context.projectId ||
      evidence.provider !== input.provider ||
      evidence.source !== input.attribution.context.source ||
      evidence.feature !== input.attribution.context.feature ||
      evidence.credentialId !== (input.attribution.credential?.id ?? null) ||
      evidence.credentialKind !== (input.attribution.credential?.kind ?? null)
    )
      throw new Error("Missing BYOK receipt lost its retained identity.");
    const native = await tx.providerCostEntry.findFirst({
      where: {
        connectionId: input.connectionId,
        providerRequestId: input.providerRequestId,
        id: { not: entryId },
        credentialSource: "own",
      },
      select: { id: true },
    });
    await lockEvidence(tx, native ? [native.id, entryId] : [entryId]);
    // Suppress projection before the transaction commits its proof.
    await recordProviderUsage(tx, {
      ...input,
      id: entryId,
      measurementStatus: "unknown",
      createdAt: evidence.createdAt,
    });
    const row = {
      entryId,
      connectionId: input.connectionId,
      providerRequestId: input.providerRequestId as string,
      costCents: String(input.costCents),
      accounted: Boolean(native),
    };
    return settleInTransaction(tx, row, input.costCents);
  });
  for (const id of ids ?? []) await syncUsageEntry(id);
  return { status: ids ? ("recorded" as const) : ("skipped" as const) };
}
