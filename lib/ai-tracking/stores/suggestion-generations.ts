import { randomUUID } from "node:crypto";
import { boundedRaw, boundedUtf8, payloadHash } from "@/lib/ai-tracking/identity";
import { suggestionGenerationPreviewSchema } from "@/lib/ai-tracking/suggestions/generation-schema";
import { makePublicId } from "@/lib/db/public-id-resources";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  PersistSuggestionGenerationInput,
  ProveGenerationNoDispatchInput,
  RecordGenerationUsageTagInput,
  StartSuggestionGenerationInput,
} from "./generation-contract";
import { jsonInput, lockTrackingProject, prisma, requireFound } from "./shared";

export type * from "./generation-contract";
export { reconcileSuggestionGeneration } from "./generation-reconciliation";

import { requireResolvedGenerations, resultSchema, validateReceipt } from "./generation-validation";

export function suggestionGenerationRequestHash(
  input: Pick<
    StartSuggestionGenerationInput,
    "preview" | "actorId" | "actorCredential" | "entrySource"
  >,
) {
  return payloadHash({
    preview: input.preview,
    actorId: input.actorId,
    actorCredential: input.actorCredential ?? null,
    entrySource: input.entrySource,
  });
}
export function getSuggestionGeneration(projectId: string, id: string) {
  return prisma.aiTrackingSuggestionGeneration.findFirst({
    where: { projectId, OR: [{ id }, { publicId: id }] },
  });
}
export function startSuggestionGeneration(
  projectId: string,
  input: StartSuggestionGenerationInput,
) {
  const preview = suggestionGenerationPreviewSchema.parse(input.preview);
  if (!input.actorId || !input.idempotencyKey || input.idempotencyKey.length > 200)
    throw new Error("Generation actor and bounded idempotency key required.");
  if (preview.snapshotHash !== payloadHash(preview.inputSnapshot))
    throw new Error("Reviewed snapshot hash mismatch.");
  if (input.requestHash !== suggestionGenerationRequestHash(input))
    throw new Error("Generation request hash mismatch.");
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const existing = await tx.aiTrackingSuggestionGeneration.findUnique({
      where: { projectId_idempotencyKey: { projectId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) {
      if (existing.requestHash !== input.requestHash)
        throw new Error("Generation idempotency key payload conflict.");
      return { created: false, row: existing };
    }
    await requireResolvedGenerations(tx, projectId);
    if (new Date(preview.expiresAt).getTime() <= Date.now())
      throw new Error("Generation preview expired.");
    const connection = requireFound(
      await tx.providerConnection.findFirst({
        where: { projectId, publicId: preview.credentialConnectionId, provider: "dataforseo" },
      }),
      "Generation connection",
    );
    for (const competitor of preview.inputSnapshot.competitors)
      requireFound(
        await tx.competitor.findFirst({ where: { projectId, publicId: competitor.id } }),
        "Reviewed competitor",
      );
    const row = await tx.aiTrackingSuggestionGeneration.create({
      data: {
        projectId,
        publicId: makePublicId("asg"),
        actorId: input.actorId,
        actorCredential: input.actorCredential ? jsonInput(input.actorCredential) : Prisma.DbNull,
        entrySource: input.entrySource,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        preview: jsonInput(preview),
        credentialConnectionId: connection.id,
        requestedModel: preview.configuration.model,
        attemptId: randomUUID(),
      },
    });
    return { created: true, row };
  });
}
export function claimSuggestionGeneration(projectId: string, id: string, attemptId: string) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    await requireResolvedGenerations(tx, projectId, id);
    const changed = await tx.aiTrackingSuggestionGeneration.updateMany({
      where: { projectId, id, attemptId, state: "planned" },
      data: { state: "claimed", claimedAt: new Date() },
    });
    return changed.count
      ? tx.aiTrackingSuggestionGeneration.findUniqueOrThrow({ where: { id } })
      : null;
  });
}
export function recordGenerationUsageTag(
  projectId: string,
  id: string,
  input: RecordGenerationUsageTagInput,
) {
  if (!input.usageTag || !input.receipt.providerCostEntryId)
    throw new Error("Native usage tag and ledger receipt required before dispatch.");
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const row = await tx.aiTrackingSuggestionGeneration.findFirst({
      where: { projectId, id, attemptId: input.attemptId, state: input.expectedState },
    });
    if (!row) return null;
    await validateReceipt(tx, projectId, row.credentialConnectionId, input.receipt);
    const preview = suggestionGenerationPreviewSchema.parse(row.preview);
    if (input.receipt.credentialVersion !== preview.credentialVersion)
      throw new Error("Generation credential version conflict.");
    const changed = await tx.aiTrackingSuggestionGeneration.updateMany({
      where: { projectId, id, attemptId: input.attemptId, state: "claimed" },
      data: {
        state: "submission_started",
        usageTag: input.usageTag,
        receipt: jsonInput(input.receipt),
        providerCostEntryId: input.receipt.providerCostEntryId,
      },
    });
    return changed.count
      ? tx.aiTrackingSuggestionGeneration.findUniqueOrThrow({ where: { id } })
      : null;
  });
}
export function proveNoDispatch(
  projectId: string,
  id: string,
  input: ProveGenerationNoDispatchInput,
) {
  if (!input.reason.trim()) throw new Error("No-dispatch proof requires a reason.");
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const row = await tx.aiTrackingSuggestionGeneration.findFirst({
      where: { projectId, id, attemptId: input.attemptId, state: input.expectedState },
    });
    if (!row) return null;
    if (row.state === "submission_started") {
      const ledger = row.providerCostEntryId
        ? await tx.providerCostEntry.findFirst({
            where: { projectId, id: row.providerCostEntryId },
          })
        : null;
      if (
        input.receipt?.amountUsd !== "0" ||
        input.receipt.state !== "confirmed" ||
        (ledger && (ledger.measurementStatus !== "recorded" || !ledger.costCents.isZero()))
      )
        throw new Error("Submission barrier requires native zero-cost cancellation proof.");
      if (ledger && input.receipt.providerCostEntryId !== ledger.id)
        throw new Error("Cancellation ledger conflict.");
    }
    if (input.receipt)
      await validateReceipt(tx, projectId, row.credentialConnectionId, input.receipt);
    const changed = await tx.aiTrackingSuggestionGeneration.updateMany({
      where: { projectId, id, attemptId: input.attemptId, state: input.expectedState },
      data: {
        state: "failed",
        finishedAt: new Date(),
        evidence: jsonInput({ noDispatch: true, reason: input.reason.slice(0, 4000) }),
        receipt: input.receipt ? jsonInput(input.receipt) : undefined,
        providerCostEntryId: input.receipt?.providerCostEntryId,
      },
    });
    return changed.count
      ? tx.aiTrackingSuggestionGeneration.findUniqueOrThrow({ where: { id } })
      : null;
  });
}
export function persistSuggestionGeneration(
  projectId: string,
  id: string,
  input: PersistSuggestionGenerationInput,
) {
  return prisma.$transaction(async (tx) => {
    await lockTrackingProject(tx, projectId);
    const row = await tx.aiTrackingSuggestionGeneration.findFirst({
      where: { projectId, id, attemptId: input.attemptId, state: input.expectedState },
    });
    if (!row) return null;
    await validateReceipt(tx, projectId, row.credentialConnectionId, input.receipt);
    if (row.providerCostEntryId && input.receipt.providerCostEntryId !== row.providerCostEntryId)
      throw new Error("Generation native ledger identity is immutable.");
    if (input.state === "completed" && (!input.result || !input.evidence || !row.usageTag))
      throw new Error("Completed generation requires native usage evidence and drafts.");
    const result = input.result ? resultSchema.parse(input.result) : undefined;
    if (
      result &&
      (result.generationId !== row.publicId ||
        new Set(result.drafts.map((draft) => draft.draftId)).size !== result.drafts.length)
    )
      throw new Error("Generation result identity invalid.");
    const preview = suggestionGenerationPreviewSchema.parse(row.preview);
    if (input.receipt.credentialVersion !== preview.credentialVersion)
      throw new Error("Generation credential version conflict.");
    if (
      result &&
      (result.costUsd !== input.receipt.amountUsd ||
        (result.costState === "confirmed") !==
          ["confirmed", "derived"].includes(input.receipt.state))
    )
      throw new Error("Generation result cost conflicts with native receipt.");
    if (
      input.evidence &&
      (input.evidence.snapshotHash !== preview.snapshotHash ||
        payloadHash(input.evidence.inputSnapshot) !== preview.snapshotHash ||
        payloadHash(input.evidence.configuration) !== payloadHash(preview.configuration) ||
        input.evidence.requestedModel !== row.requestedModel ||
        input.evidence.credentialVersion !== preview.credentialVersion ||
        input.evidence.budgetRevision !== preview.budgetRevision ||
        input.evidence.consentRevision !== preview.consentRevision)
    )
      throw new Error("Generation evidence conflicts with frozen review.");
    const answer = input.evidence ? boundedUtf8(input.evidence.answer, 256 * 1024) : null;
    const raw = input.evidence?.raw !== undefined ? boundedRaw(input.evidence.raw) : null;
    const evidence = input.evidence
      ? {
          ...input.evidence,
          answer: answer?.text ?? "",
          answerTruncated: answer?.truncated ?? false,
          ...(raw ? { raw: raw.raw, rawTruncated: raw.truncated } : {}),
        }
      : undefined;
    const changed = await tx.aiTrackingSuggestionGeneration.updateMany({
      where: { projectId, id, attemptId: input.attemptId, state: input.expectedState },
      data: {
        state: input.state,
        result: result ? jsonInput(result) : undefined,
        resultHash: result ? payloadHash(result) : undefined,
        evidence: evidence ? jsonInput(evidence) : undefined,
        actualModel: input.actualModel ?? input.evidence?.actualModel,
        receipt: jsonInput(input.receipt),
        providerCostEntryId: input.receipt.providerCostEntryId,
        finishedAt: input.state === "submission_unknown" ? null : new Date(),
      },
    });
    return changed.count
      ? tx.aiTrackingSuggestionGeneration.findUniqueOrThrow({ where: { id } })
      : null;
  });
}
