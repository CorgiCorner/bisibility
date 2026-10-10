import { promptInputSchema } from "@/lib/ai-tracking/schema";
import { z } from "zod";

const acceptedDraft = z
  .object({
    text: promptInputSchema.shape.text,
    category: promptInputSchema.shape.category.unwrap(),
    generationReference: promptInputSchema.shape.generationReference,
    providerDatasetReference: promptInputSchema.shape.providerDatasetReference,
    provenance: z
      .enum(["generated_hypothesis", "model_generated_hypothesis", "provider_dataset"])
      .optional(),
    evidenceIds: z.array(z.string()).max(30).optional(),
    popularity: z.null().optional(),
    accepted: z.literal(false).optional(),
    generationId: z.string().optional(),
    draftId: z.uuid().optional(),
  })
  .strict()
  .superRefine((draft, ctx) => {
    if (draft.generationReference && draft.providerDatasetReference)
      ctx.addIssue({ code: "custom", message: "Choose one authoritative draft source." });
    if (
      (draft.provenance === "model_generated_hypothesis" || draft.generationId || draft.draftId) &&
      !draft.generationReference
    )
      ctx.addIssue({
        code: "custom",
        message: "Model drafts require a trusted generation reference.",
      });
    if (draft.provenance === "provider_dataset" && !draft.providerDatasetReference)
      ctx.addIssue({
        code: "custom",
        message: "Dataset drafts require a trusted stored report reference.",
      });
    if (draft.evidenceIds?.length && !draft.generationReference && !draft.providerDatasetReference)
      ctx.addIssue({
        code: "custom",
        message: "Evidence claims require an authoritative source reference.",
      });
  });
export const trackingAcceptanceSchema = z
  .object({ drafts: z.array(acceptedDraft).min(1).max(20) })
  .strict();

export function trackingAcceptedDrafts(value: unknown) {
  const seen = new Set<string>();
  return trackingAcceptanceSchema.parse(value).drafts.filter((draft) => {
    const key = draft.text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
