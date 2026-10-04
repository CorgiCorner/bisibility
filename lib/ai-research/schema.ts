import { z } from "zod";

const common = {
  brand: z.string().trim().min(1).max(120),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(63)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  estimate_only: z.boolean().default(false),
  fresh: z.boolean().default(false),
  max_cost_cents: z.number().int().min(0).max(1000),
};
export const visibilitySchema = z
  .object({
    ...common,
    target_type: z.enum(["brand", "domain"]).default("domain"),
    platform: z.enum(["chat_gpt", "google"]).default("chat_gpt"),
    location_code: z.number().int().positive().default(2840),
    language_code: z
      .string()
      .trim()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .default("en"),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
export const PROMPT_MODELS = ["gpt-4.1-mini", "gpt-4.1-nano"] as const;
export const promptSchema = z
  .object({
    ...common,
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .refine(
        (value) => new TextEncoder().encode(value).length <= 2000,
        "Prompt must be at most 2000 UTF-8 bytes.",
      ),
    models: z
      .array(z.enum(PROMPT_MODELS))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, "Models must be distinct.")
      .default([...PROMPT_MODELS]),
  })
  .strict();
export type VisibilityInput = z.infer<typeof visibilitySchema>;
export type PromptInput = z.infer<typeof promptSchema>;
export type AiResearchKind = "ai_visibility" | "prompt_explorer";
