import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";
import { generationCanonicalJson } from "./generation-json";

export const REVIEWED_CONTEXT_CHARACTER_LIMIT = 5000;
const publicConnection = z.string().refine((id) => isPublicIdOfType(id, "conn"));
export const suggestionGenerationConfigurationSchema = z
  .object({
    provider: z.literal("dataforseo"),
    engine: z.literal("chat_gpt"),
    model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/),
    languageCode: z.string().min(2).max(20),
    countryIsoCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    maxOutputTokens: z.number().int().min(16).max(4096),
    advisoryCostLimitCents: z.number().positive().finite().max(1000000),
  })
  .strict();
export const suggestionGenerationSnapshotSchema = z
  .object({
    context: z
      .object({
        business: z.string(),
        audience: z.string(),
        products: z.string(),
        goals: z.string(),
        agentRules: z.string(),
      })
      .strict(),
    competitors: z
      .array(
        z
          .object({
            id: z.string().refine((id) => isPublicIdOfType(id, "cmp")),
            label: z.string().nullable(),
            domain: z.string().min(1).max(253),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const length = Array.from(generationCanonicalJson(snapshot)).length;
    if (length > REVIEWED_CONTEXT_CHARACTER_LIMIT)
      ctx.addIssue({
        code: "custom",
        message: `Reviewed context serializes to ${length} characters; the limit is ${REVIEWED_CONTEXT_CHARACTER_LIMIT}. Explicitly reduce the reviewed scope and preview again.`,
      });
    if (new Set(snapshot.competitors.map((item) => item.id)).size !== snapshot.competitors.length)
      ctx.addIssue({
        code: "custom",
        message: "Reviewed competitors must have unique public IDs.",
      });
  });
export const modelSuggestionsPreviewInputSchema = z
  .object({
    configuration: suggestionGenerationConfigurationSchema,
    inputSnapshot: suggestionGenerationSnapshotSchema,
    credentialConnectionId: publicConnection.optional(),
  })
  .strict();
export const suggestionGenerationPreviewSchema = z
  .object({
    version: z.literal(1),
    configuration: suggestionGenerationConfigurationSchema,
    inputSnapshot: suggestionGenerationSnapshotSchema,
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    estimatedCostCents: z.number().positive().finite(),
    estimateKind: z.literal("forecast"),
    isGuaranteedMaximum: z.literal(false),
    credentialConnectionId: publicConnection,
    credentialVersion: z.string().min(1),
    budgetRevision: z.string().min(1),
    consentRevision: z.string().min(1),
    expiresAt: z.string().datetime(),
    limitations: z.array(z.string()).max(20),
  })
  .strict();
export const modelSuggestionsGenerateInputSchema = z
  .object({
    preview: suggestionGenerationPreviewSchema,
    consent: z.literal(true),
  })
  .strict();
export const suggestionGenerationPreviewInputSchema = modelSuggestionsPreviewInputSchema;
export const suggestionGenerationInputSchema = modelSuggestionsGenerateInputSchema;
export type SuggestionGenerationConfiguration = z.infer<
  typeof suggestionGenerationConfigurationSchema
>;
export type SuggestionGenerationSnapshot = z.infer<typeof suggestionGenerationSnapshotSchema>;
export type SuggestionGenerationPreviewInput = z.infer<typeof modelSuggestionsPreviewInputSchema>;
export type SuggestionGenerationPreview = z.infer<typeof suggestionGenerationPreviewSchema>;
export type SuggestionGenerationInput = z.infer<typeof modelSuggestionsGenerateInputSchema>;
export type SuggestionGenerationDraft = {
  draftId: string;
  text: string;
  category: "neutral" | "comparative" | "branded";
  provenance: "model_generated_hypothesis";
  evidenceIds: string[];
  popularity: null;
  accepted: false;
};
export type SuggestionGenerationResult = {
  generationId: string;
  drafts: SuggestionGenerationDraft[];
  costUsd: string | null;
  costState: "confirmed" | "unknown";
  method: "model_generated_hypothesis";
  limitations: string[];
};

export class SuggestionGenerationError extends Error {
  constructor(
    readonly status: 409 | 422,
    readonly reason: string,
    message: string,
    readonly generationId?: string,
  ) {
    super(message);
  }
}
