import "server-only";
import { z } from "zod";
import { ASSISTANT_EFFORTS, PROVIDER_EFFORTS } from "./effort";
import { ASSISTANT_PROVIDERS } from "./wire";

const amount = z.number().int().nonnegative().safe();
export const assistantPricingSchema = z
  .object({
    version: z.string().trim().min(1).max(100),
    inputMicroUsdPerMTok: amount,
    cachedInputMicroUsdPerMTok: amount,
    cacheWriteMicroUsdPerMTok: amount,
    outputMicroUsdPerMTok: amount,
  })
  .strict();

export const assistantModelSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    provider: z.enum(ASSISTANT_PROVIDERS),
    providerModel: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(200),
    toolUse: z.boolean(),
    /** Output cap sent with every request. Reasoning tokens count inside it for every effort. */
    maxOutputTokens: z.number().int().positive().safe(),
    contextChars: z.number().int().positive().safe(),
    pricing: assistantPricingSchema,
    /** Reasoning efforts the model offers. Omitted or empty for a model without reasoning. */
    efforts: z.array(z.enum(ASSISTANT_EFFORTS)).max(ASSISTANT_EFFORTS.length).optional(),
    /** Required with a non-empty efforts list and one of its values. */
    defaultEffort: z.enum(ASSISTANT_EFFORTS).optional(),
  })
  .strict()
  .superRefine((model, context) => {
    if (
      model.provider === "anthropic" &&
      model.providerModel === "claude-haiku-5-5" &&
      model.contextChars > 64_000
    )
      context.addIssue({
        code: "custom",
        path: ["contextChars"],
        message: "Haiku 5.5 requires a 64000-byte context cap for short-tier pricing.",
      });
    const efforts = model.efforts ?? [];
    if (new Set(efforts).size !== efforts.length)
      context.addIssue({ code: "custom", path: ["efforts"], message: "Duplicate effort." });
    const allowed = PROVIDER_EFFORTS[model.provider];
    if (efforts.some((effort) => !allowed.includes(effort)))
      context.addIssue({ code: "custom", path: ["efforts"], message: "Unsupported effort." });
    const validDefault = efforts.length
      ? model.defaultEffort !== undefined && efforts.includes(model.defaultEffort)
      : model.defaultEffort === undefined;
    if (!validDefault)
      context.addIssue({ code: "custom", path: ["defaultEffort"], message: "Invalid default." });
  });

export type AssistantModel = z.infer<typeof assistantModelSchema>;
export type AssistantPricing = z.infer<typeof assistantPricingSchema>;

export function parseAssistantModels(value: string | undefined): AssistantModel[] | null {
  if (!value) return null;
  try {
    const result = z.array(assistantModelSchema).min(1).safeParse(JSON.parse(value));
    if (!result.success) return null;
    if (new Set(result.data.map((model) => model.id)).size !== result.data.length) return null;
    return result.data;
  } catch {
    return null;
  }
}
