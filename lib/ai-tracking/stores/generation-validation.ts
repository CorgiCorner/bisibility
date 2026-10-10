import { canonicalJson } from "@/lib/ai-tracking/identity";
import { SuggestionGenerationError } from "@/lib/ai-tracking/suggestions/generation-schema";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import type { GenerationReceipt } from "./generation-contract";
import { reconcileProjectGenerations } from "./generation-reconciliation";
import { requireFound, type TrackingTransaction } from "./shared";

const draftSchema = z
  .object({
    draftId: z.uuid(),
    text: z.string().min(1).max(64000),
    category: z.enum(["neutral", "branded", "comparative"]),
    provenance: z.literal("model_generated_hypothesis"),
    evidenceIds: z.array(z.string()).length(0),
    popularity: z.null(),
    accepted: z.literal(false),
  })
  .strict();
export const resultSchema = z
  .object({
    generationId: z.string(),
    drafts: z.array(draftSchema).min(1).max(30),
    costUsd: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    costState: z.enum(["confirmed", "unknown"]),
    method: z.literal("model_generated_hypothesis"),
    limitations: z.array(z.string().max(2000)).max(20),
  })
  .strict()
  .refine(
    (result) => Buffer.byteLength(canonicalJson(result), "utf8") <= 64 * 1024,
    "Generated drafts exceed retained result bound.",
  );
export async function requireResolvedGenerations(
  tx: TrackingTransaction,
  projectId: string,
  exceptId?: string,
) {
  await reconcileProjectGenerations(tx, projectId, exceptId);
  const unresolved = await tx.aiTrackingSuggestionGeneration.findFirst({
    where: {
      projectId,
      ...(exceptId ? { id: { not: exceptId } } : {}),
      OR: [
        { state: { in: ["claimed", "submission_started", "submission_unknown"] } },
        { providerCostEntry: { is: { measurementStatus: "unknown" } } },
      ],
    },
    select: { publicId: true },
  });
  if (unresolved)
    throw new SuggestionGenerationError(
      409,
      "usage_reconciliation_required",
      "Project has an unresolved suggestion generation; reconcile its native receipt before another paid attempt.",
      unresolved.publicId,
    );
}
export async function validateReceipt(
  tx: TrackingTransaction,
  projectId: string,
  connectionId: string,
  receipt: GenerationReceipt,
) {
  if (
    receipt.connectionId !== connectionId ||
    !receipt.credentialVersion ||
    (receipt.amountUsd !== null && !/^\d+(\.\d+)?$/.test(receipt.amountUsd))
  )
    throw new Error("Generation receipt identity invalid.");
  if (receipt.providerCostEntryId) {
    const ledger = requireFound(
      await tx.providerCostEntry.findFirst({
        where: { projectId, id: receipt.providerCostEntryId, connectionId },
      }),
      "Generation native ledger receipt",
    );
    if (
      ["confirmed", "derived"].includes(receipt.state) &&
      (ledger.measurementStatus !== "recorded" ||
        receipt.amountUsd === null ||
        !ledger.costCents.div(100).equals(new Prisma.Decimal(receipt.amountUsd)))
    )
      throw new Error("Generation cost conflicts with authoritative native ledger.");
  }
}
