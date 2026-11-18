import "server-only";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { ModelColumnResult } from "./types";
import { createModelUsageReceipt, modelUsageDigest, validateModelUsageReceipt } from "./usage";
import { type ModelUsageBinding, modelUsageBindingSchema } from "./usage-contract";

export class ModelUsageEvidenceConflict extends Error {}

type Client = Pick<PrismaClient, "meteringUsageEvidence">;
type Row = NonNullable<Awaited<ReturnType<Client["meteringUsageEvidence"]["findUnique"]>>>;
function estimate(row: Row): Prisma.JsonObject {
  return row.estimate !== null && typeof row.estimate === "object" && !Array.isArray(row.estimate)
    ? row.estimate
    : {};
}
function assertRow(row: Row | null, binding: ModelUsageBinding): asserts row is Row {
  if (
    !row ||
    row.discarded ||
    !row.namespace ||
    row.id !== binding.attemptId ||
    row.feature !== "model_playground" ||
    row.projectId !== binding.projectId ||
    row.principal !== binding.principal ||
    row.source !== binding.source ||
    row.provider !== binding.column.providerId ||
    row.connectionId !== binding.connectionId ||
    estimate(row).credentialVersion !== binding.credentialVersion ||
    estimate(row).publicConnectionId !== binding.column.connectionId
  )
    throw new Error("Native evidence does not match the retained attempt.");
}
function retainedBinding(row: Row) {
  const stored = row.receipt;
  const binding = modelUsageBindingSchema.parse(
    stored && typeof stored === "object" && !Array.isArray(stored) ? stored.binding : null,
  );
  assertRow(row, binding);
  return binding;
}
function proofIdentity(receipt: ReturnType<typeof createModelUsageReceipt>) {
  return modelUsageDigest({
    ...receipt,
    evidence: receipt.evidence ? { ...receipt.evidence, occurredAt: null } : null,
  });
}
async function lockedRow(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM metering_usage_evidence WHERE id=${id} FOR UPDATE`;
  const row = await tx.meteringUsageEvidence.findUnique({ where: { id } });
  if (!row) throw new Error("Native evidence attempt is unavailable.");
  return row;
}

/** P09b calls this in its pre-dispatch transaction after capturing the own-key identity. */
export async function bindModelUsageEvidence(
  tx: Prisma.TransactionClient,
  id: string,
  input: ModelUsageBinding,
) {
  const binding = modelUsageBindingSchema.parse(input);
  const row = await lockedRow(tx, id);
  assertRow(row, binding);
  if (row.receipt !== null) {
    if (modelUsageDigest(retainedBinding(row)) !== modelUsageDigest(binding))
      throw new Error("Native usage binding is immutable.");
    validateModelUsageReceipt(row.receipt, binding);
    return;
  }
  await tx.meteringUsageEvidence.update({
    where: { id },
    data: {
      receipt: createModelUsageReceipt(binding, null) as unknown as Prisma.InputJsonObject,
      proofVersion: row.proofVersion + 1,
    },
  });
}

/** Read-only and project-scoped; a missing receipt remains an unknown dispatched exposure. */
export async function loadModelUsageEvidence(db: Client, id: string, projectId: string) {
  const row = await db.meteringUsageEvidence.findUnique({ where: { id } });
  if (!row || row.discarded || row.projectId !== projectId || row.feature !== "model_playground")
    return null;
  const state = {
    canonicalId: row.canonicalId,
    counted: row.canonicalId === null,
    proofVersion: row.proofVersion,
  };
  if (row.receipt === null)
    return {
      ...state,
      receipt: null,
      usageStatus: "unknown" as const,
      additionalExposure: "unknown" as const,
      reconciliationRequired: true,
      automaticPaidRetryAllowed: false as const,
    };
  const binding = retainedBinding(row);
  const receipt = validateModelUsageReceipt(row.receipt, binding);
  return { ...state, receipt };
}

export type LoadedModelUsageEvidence = NonNullable<
  Awaited<ReturnType<typeof loadModelUsageEvidence>>
>;

/** Trusted transport output only. This retains proof; it grants no dispatch or settlement authority. */
export async function persistModelUsageEvidence(
  tx: Prisma.TransactionClient,
  id: string,
  response: ModelColumnResult | null,
) {
  // Serialize native-ID dedup before row locks, including competing column attempts.
  if (response?.providerRequestId) {
    const initial = await tx.meteringUsageEvidence.findUnique({ where: { id } });
    if (!initial) throw new Error("Native evidence attempt is unavailable.");
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["own-native", initial.connectionId, response.providerRequestId])},0))`;
  }
  const row = await lockedRow(tx, id);
  const binding = retainedBinding(row);
  const previous = row.receipt === null ? null : validateModelUsageReceipt(row.receipt, binding);
  const receipt = createModelUsageReceipt(binding, response, previous?.version);
  if (previous && proofIdentity(previous) === proofIdentity(receipt))
    return { receipt: previous, canonicalId: row.canonicalId, changed: false };
  if (
    previous?.evidence ||
    (row.providerRequestId && row.providerRequestId !== response?.providerRequestId)
  )
    throw new ModelUsageEvidenceConflict(
      "Native usage proof is immutable; reconciliation requires an explicit correction.",
    );
  const nativeId = receipt.evidence?.providerRequestId;
  const existing = nativeId
    ? await tx.meteringUsageEvidence.findFirst({
        where: {
          connectionId: row.connectionId,
          providerRequestId: nativeId,
          id: { not: id },
          discarded: false,
        },
      })
    : null;
  const canonicalId = existing ? (existing.canonicalId ?? existing.id) : null;
  if (existing && canonicalId) {
    const original = await loadModelUsageEvidence(tx, canonicalId, binding.projectId);
    if (
      !original ||
      modelUsageDigest(
        original.receipt?.evidence && { ...original.receipt.evidence, occurredAt: null },
      ) !== modelUsageDigest(receipt.evidence && { ...receipt.evidence, occurredAt: null })
    )
      throw new ModelUsageEvidenceConflict("Duplicate native request has conflicting evidence.");
  }
  await tx.meteringUsageEvidence.update({
    where: { id },
    data: {
      receipt: receipt as unknown as Prisma.InputJsonObject,
      providerRequestId: nativeId ?? null,
      canonicalId,
      measurementStatus:
        receipt.usageStatus === "complete" && receipt.additionalExposure !== "unknown"
          ? "native_complete"
          : "unknown",
      proofVersion: row.proofVersion + 1,
    },
  });
  return { receipt, canonicalId, changed: true };
}
