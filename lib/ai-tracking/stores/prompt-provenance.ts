import { boundedRaw, exactTextHash, payloadHash } from "@/lib/ai-tracking/identity";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import { jsonInput, requireFound, type TrackingTransaction } from "./shared";
import type { PromptInput } from "./signatures";

const datasetRowSchema = z
  .object({
    prompt: z.string().min(1),
    model: z.string(),
    answer: z.string(),
    observedAt: z.string().nullable(),
    brandMentioned: z.boolean(),
    domainCited: z.boolean(),
    citations: z.array(
      z.object({
        title: z.string().nullable(),
        url: z.string(),
        targetDomain: z.boolean(),
      }),
    ),
  })
  .passthrough();
function boundedProvenance(value: Parameters<typeof jsonInput>[0]) {
  const encoded = jsonInput(value);
  if (boundedRaw(encoded as import("@/lib/ai-tracking/contract").JsonValue).truncated)
    throw new Error("Provider dataset row exceeds the retained provenance bound.");
  return encoded;
}
export async function resolvePromptProvenance(
  tx: TrackingTransaction,
  projectId: string,
  input: Pick<PromptInput, "generationReference" | "providerDatasetReference">,
) {
  if (input.generationReference && input.providerDatasetReference)
    throw new Error("Prompt has one trusted suggestion source.");
  if (input.generationReference) {
    const { generationId, draftId } = input.generationReference;
    const generation = requireFound(
      await tx.aiTrackingSuggestionGeneration.findFirst({
        where: { projectId, publicId: generationId, state: "completed" },
      }),
      "Completed suggestion generation",
    );
    const result = z
      .object({
        drafts: z.array(
          z
            .object({
              draftId: z.uuid(),
              text: z.string(),
              category: z.enum(["neutral", "branded", "comparative"]),
              provenance: z.literal("model_generated_hypothesis"),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(generation.result);
    const draft = requireFound(
      result.drafts.find((item) => item.draftId === draftId) ?? null,
      "Generation draft",
    );
    return {
      generationId: generation.id,
      generationDraftId: draftId,
      provenance: jsonInput({
        method: "model_generated_hypothesis",
        generationId: generation.publicId,
        draftId,
        originalDraft: draft,
        resultHash: generation.resultHash,
        measuredPopularity: null,
      }),
    };
  }
  if (input.providerDatasetReference) {
    const { reportId, rowIndex } = input.providerDatasetReference;
    const report = requireFound(
      await tx.agentReport.findFirst({
        where: { projectId, publicId: reportId, kind: "ai_visibility" },
      }),
      "Provider dataset report",
    );
    const provenance = z
      .object({
        evidence: z.literal("observed_dataset"),
        scope: z.literal("provider_dataset_only"),
        provider: z.literal("dataforseo"),
        endpoint: z.literal("llm_mentions/search_mentions/live"),
        providerRequestIds: z.array(z.string()),
      })
      .passthrough()
      .parse(report.provenance);
    const body = z
      .object({
        input: z.json(),
        result: z
          .object({
            evidence: z.literal("observed_dataset"),
            rows: z.array(datasetRowSchema),
            fetchedAt: z.string(),
          })
          .passthrough(),
      })
      .passthrough()
      .parse(report.body);
    const row = requireFound(body.result.rows[rowIndex] ?? null, "Provider dataset row");
    return {
      generationId: null,
      generationDraftId: null,
      provenance: boundedProvenance({
        method: "provider_dataset",
        scope: "provider_dataset_only",
        reportId,
        rowIndex,
        originalPrompt: row.prompt,
        promptHash: exactTextHash(row.prompt),
        reportSnapshotHash: payloadHash({ body: report.body, provenance: report.provenance }),
        input: body.input,
        row,
        provider: provenance.provider,
        providerRequestIds: provenance.providerRequestIds,
        fetchedAt: body.result.fetchedAt,
        measuredPopularity: null,
      }),
    };
  }
  return { generationId: null, generationDraftId: null, provenance: Prisma.DbNull };
}
