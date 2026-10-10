import { suggestionGenerationPreviewSchema } from "@/lib/ai-tracking/suggestions/generation-schema";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { jsonInput, lockTrackingProject, prisma, type TrackingTransaction } from "./shared";

const actorCredentialSchema = z
  .object({ id: z.string(), kind: z.enum(["project_key", "personal_token", "oauth_client"]) })
  .nullable();
const retainedReceiptSchema = z.object({
  providerCostEntryId: z.string(),
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
  if (!row?.providerCostEntryId || !row.usageTag) return null;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM provider_cost_entries WHERE id = ${row.providerCostEntryId} AND "projectId" = ${projectId} FOR SHARE`,
  );
  const ledger = await tx.providerCostEntry.findFirst({
    where: {
      id: row.providerCostEntryId,
      projectId,
      connectionId: row.credentialConnectionId,
      measurementStatus: "recorded",
    },
  });
  if (!ledger || ledger.costCents.isNegative()) return null;
  const preview = suggestionGenerationPreviewSchema.safeParse(row.preview);
  const retained = retainedReceiptSchema.safeParse(row.receipt);
  const credential = actorCredentialSchema.safeParse(row.actorCredential);
  if (!preview.success || !retained.success || !credential.success) return null;
  if (
    retained.data.providerCostEntryId !== ledger.id ||
    retained.data.connectionId !== ledger.connectionId ||
    retained.data.credentialVersion !== preview.data.credentialVersion ||
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
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM metering_usage_evidence WHERE id = ${ledger.id} FOR SHARE`,
  );
  const evidence = await tx.meteringUsageEvidence.findUnique({ where: { id: ledger.id } });
  if (
    !evidence ||
    evidence.discarded ||
    evidence.projectId !== projectId ||
    evidence.connectionId !== row.credentialConnectionId ||
    evidence.provider !== ledger.provider ||
    evidence.feature !== "ai_tracking" ||
    evidence.correlationId !== row.attemptId ||
    evidence.source !== row.entrySource ||
    evidence.credentialKind !== ledger.credentialKind ||
    evidence.credentialId !== ledger.credentialId
  )
    return null;
  const estimate = z.object({ credentialVersion: z.string() }).safeParse(evidence.estimate);
  if (!estimate.success || estimate.data.credentialVersion !== preview.data.credentialVersion)
    return null;
  const changed = await tx.aiTrackingSuggestionGeneration.updateMany({
    where: {
      projectId,
      id,
      attemptId: row.attemptId,
      state: "submission_unknown",
      providerCostEntryId: ledger.id,
      receipt: { equals: jsonInput(row.receipt) },
    },
    data: {
      state: "failed",
      finishedAt: new Date(),
      receipt: jsonInput({
        ...(row.receipt as Prisma.JsonObject),
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
      providerCostEntry: { is: { measurementStatus: "recorded" } },
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  for (const candidate of candidates)
    await reconcileGenerationInTransaction(tx, projectId, candidate.id);
}
