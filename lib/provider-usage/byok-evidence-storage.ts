import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { receiptFromEntry, type UsageEntry } from "@/lib/metering/mapping";
import type { ProviderUsageReceipt } from "@/lib/providers/usage";
import { PROVIDER_REQUEST_SOURCES } from "./tag";

type EvidenceClient = Pick<PrismaClient, "meteringUsageEvidence">;

/** Do not infer a historical owner from the current project. Missing identity is unknown. */
export async function loadByokEvidence(db: EvidenceClient, id: string): Promise<UsageEntry | null> {
  const row = await db.meteringUsageEvidence.findUnique({ where: { id } });
  const source = PROVIDER_REQUEST_SOURCES.find((source) => source === row?.source);
  if (!row || row.discarded || !source || !row.namespace) return null;
  const receipt = row.receipt as {
    costCents: string | null;
    quantity: string | null;
    cached: boolean;
    failed: boolean;
  } | null;
  return {
    id: row.id,
    namespace: row.namespace,
    proofVersion: row.proofVersion,
    ownerId: row.principal,
    projectId: row.projectId,
    connectionId: row.connectionId,
    provider: row.provider,
    feature: row.feature,
    source,
    credentialSource: "own",
    credentialId: row.credentialId,
    credentialKind: row.credentialKind,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
    unit: row.unit === "units" ? "units" : "cents",
    costCents: receipt?.costCents ?? "0",
    usageQuantity: receipt?.quantity ?? null,
    cached: receipt?.cached ?? false,
    failed: receipt?.failed ?? false,
    measurementStatus: row.measurementStatus === "recorded" ? "recorded" : "unknown",
    costMeasurement: receipt?.costCents == null ? "unknown" : "recorded",
    quantityMeasurement: receipt?.quantity == null ? "unknown" : "recorded",
    providerRequestId: row.canonicalId ? null : row.providerRequestId,
    providerCredentialVersion: (row.estimate as { credentialVersion?: string }).credentialVersion,
    allocationTag: (row.estimate as { allocationTag?: string }).allocationTag,
    publicConnectionId:
      (row.estimate as { publicConnectionId?: string }).publicConnectionId ?? null,
  };
}

/** Persist native proof only; the caller acknowledges authority in this same transaction. */
export async function persistByokEvidence(
  tx: Prisma.TransactionClient,
  id: string,
  receipt: ProviderUsageReceipt,
  canonicalId: string | null,
) {
  await tx.$queryRaw`SELECT id FROM metering_usage_evidence WHERE id=${id} FOR UPDATE`;
  const row = await tx.meteringUsageEvidence.findUnique({ where: { id } });
  if (!row || row.discarded) throw new Error("BYOK accounting identity is unavailable.");
  const providerRequestId = receipt.cached
    ? null
    : (receipt.providerRequestId ?? row.providerRequestId);
  if (
    (row.providerRequestId && row.providerRequestId !== providerRequestId) ||
    (row.canonicalId && row.canonicalId !== canonicalId)
  )
    throw new Error("BYOK accounting proof identity is immutable.");
  const previous = row.receipt as {
    costCents?: string | null;
    quantity?: string | null;
    cached?: boolean;
    failed?: boolean;
  } | null;
  const cost = canonicalId
    ? "0"
    : receipt.costCents === null
      ? (previous?.costCents ?? null)
      : new Prisma.Decimal(receipt.costCents).toFixed(4);
  const quantity = canonicalId
    ? "0"
    : receipt.quantity === null
      ? (previous?.quantity ?? null)
      : new Prisma.Decimal(receipt.quantity).toFixed(6);
  const measured = cost === null || quantity === null ? null : "known";
  const changed =
    !previous ||
    previous.costCents !== cost ||
    previous.quantity !== quantity ||
    previous.cached !== receipt.cached ||
    previous.failed !== receipt.failed ||
    row.providerRequestId !== providerRequestId ||
    row.canonicalId !== canonicalId;
  if (!changed) return;
  await tx.meteringUsageEvidence.update({
    where: { id },
    data: {
      receipt: { costCents: cost, quantity, cached: receipt.cached, failed: receipt.failed },
      proofVersion: row.proofVersion + 1,
      providerRequestId,
      canonicalId,
      measurementStatus: measured === null ? "unknown" : "recorded",
    },
  });
  const entry = await loadByokEvidence(tx, id);
  if (entry)
    await tx.meteringUsageEvidence.update({
      where: { id },
      data: { receiptId: receiptFromEntry(entry, new Date()).id },
    });
}
