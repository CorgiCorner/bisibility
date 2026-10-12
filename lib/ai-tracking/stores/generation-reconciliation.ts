import { suggestionGenerationPreviewSchema } from "@/lib/ai-tracking/suggestions/generation-schema";
import type { Prisma } from "@/lib/generated/prisma/client";
import { meterOperationReference, receiptOperationId } from "@/lib/metering/operation-reference";
import { canonicalReceipt } from "@/lib/metering/usage-read";
import { z } from "zod";
import { jsonInput, lockTrackingProject, prisma, type TrackingTransaction } from "./shared";

const actorCredentialSchema = z
  .object({ id: z.string(), kind: z.enum(["project_key", "personal_token", "oauth_client"]) })
  .nullable();
const retainedReceiptSchema = z.object({
  providerCostEntryId: z.string().nullable(),
  operationRef: z
    .object({ version: z.literal(1), namespace: z.string(), operationId: z.string() })
    .optional(),
  connectionId: z.string(),
  credentialVersion: z.string(),
});

export async function reconcileGenerationInTransaction(
  tx: TrackingTransaction,
  projectId: string,
  id: string,
) {
  const row = await tx.aiTrackingSuggestionGeneration.findFirst({
    where: { projectId, id, state: "submission_unknown" },
  });
  const operationId = receiptOperationId(row?.receipt);
  if (!row || !operationId || !row.usageTag) return null;
  const ledger = await canonicalReceipt(tx, projectId, operationId, row.credentialConnectionId);
  if (!ledger?.costCents || ledger.costCents.isNegative()) return null;
  const preview = suggestionGenerationPreviewSchema.safeParse(row.preview);
  const retained = retainedReceiptSchema.safeParse(row.receipt);
  const credential = actorCredentialSchema.safeParse(row.actorCredential);
  if (!preview.success || !retained.success || !credential.success) return null;
  if (
    ![ledger.id, ledger.id.replace(/^legacy:/, "")].includes(
      receiptOperationId(retained.data) ?? "",
    ) ||
    retained.data.connectionId !== ledger.connectionId ||
    retained.data.credentialVersion !== preview.data.credentialVersion ||
    ledger.providerCredentialVersion !== preview.data.credentialVersion ||
    ledger.provider !== "dataforseo" ||
    ledger.feature !== "ai_tracking" ||
    ledger.credentialSource !== "own" ||
    ledger.tag !== row.usageTag ||
    ledger.correlationId !== row.attemptId ||
    ledger.source !== row.entrySource ||
    ledger.credentialKind !== (credential.data?.kind ?? null) ||
    ledger.credentialId !== (credential.data?.id ?? null)
  )
    return null;
  const changed = await tx.aiTrackingSuggestionGeneration.updateMany({
    where: {
      projectId,
      id,
      attemptId: row.attemptId,
      state: "submission_unknown",

      receipt: { equals: jsonInput(row.receipt) },
    },
    data: {
      state: "failed",
      finishedAt: new Date(),
      receipt: jsonInput({
        ...(row.receipt as Prisma.JsonObject),
        operationRef: meterOperationReference(ledger.id, ledger.namespace),
        amountUsd: ledger.costCents.div(100).toString(),
        state: "confirmed",
        providerRequestId: ledger.providerRequestId,
      }),
    },
  });
  return changed.count
    ? tx.aiTrackingSuggestionGeneration.findUniqueOrThrow({ where: { id } })
    : null;
}

export function reconcileSuggestionGeneration(projectId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    return reconcileGenerationInTransaction(tx, projectId, id);
  });
}

export async function reconcileProjectGenerations(
  tx: TrackingTransaction,
  projectId: string,
  exceptId?: string,
) {
  const candidates = await tx.aiTrackingSuggestionGeneration.findMany({
    where: {
      projectId,
      state: "submission_unknown",
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  for (const candidate of candidates)
    await reconcileGenerationInTransaction(tx, projectId, candidate.id);
}
