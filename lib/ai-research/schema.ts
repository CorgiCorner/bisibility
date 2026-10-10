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
export const promptSchema = z
  .object({
    ...common,
    max_cost_cents: common.max_cost_cents.optional(),
    cost_policy: z.enum(["hard_cap", "provider_actual_cost"]).default("hard_cap"),
    actual_cost_acknowledgement: z.literal("non_guaranteed_estimate_v1").optional(),
    estimated_cost_limit_cents: z.number().int().min(0).max(1000).optional(),
    idempotency_key: z.uuid().optional(),
    estimate_credentials_ref: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
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
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
      )
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, "Models must be distinct.")
      .default(["gpt-4.1-mini", "gpt-4.1-nano"]),
    web_search: z.boolean().default(false),
    country_iso_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    response_language: z
      .string()
      .regex(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,4})?$/)
      .default("en"),
    max_output_tokens: z.number().int().min(16).max(4096).default(512),
  })
  .strict()
  .refine((value) => !value.country_iso_code || value.web_search, {
    message: "Country hints require web search.",
    path: ["country_iso_code"],
  })
  .superRefine((value, context) => {
    if (value.cost_policy === "hard_cap") {
      if (value.max_cost_cents === undefined)
        context.addIssue({
          code: "custom",
          path: ["max_cost_cents"],
          message: "A hard cost cap is required.",
        });
      for (const key of [
        "actual_cost_acknowledgement",
        "estimated_cost_limit_cents",
        "idempotency_key",
        "estimate_credentials_ref",
      ] as const)
        if (value[key] !== undefined)
          context.addIssue({
            code: "custom",
            path: [key],
            message: "This field requires the explicit provider actual-cost policy.",
          });
    } else {
      if (value.max_cost_cents !== undefined)
        context.addIssue({
          code: "custom",
          path: ["max_cost_cents"],
          message:
            "Actual provider cost has no guaranteed maximum. Use the advisory estimate limit.",
        });
      for (const key of ["actual_cost_acknowledgement", "estimated_cost_limit_cents"] as const)
        if (value[key] === undefined)
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Explicit non-guaranteed estimate consent and an advisory limit are required.",
          });
      if (!value.estimate_only)
        for (const key of ["idempotency_key", "estimate_credentials_ref"] as const)
          if (value[key] === undefined)
            context.addIssue({
              code: "custom",
              path: [key],
              message:
                "Execution requires the estimate credential identity and a stable request ID.",
            });
    }
  });
export type VisibilityInput = z.infer<typeof visibilitySchema>;
export type PromptInput = z.infer<typeof promptSchema>;
export type AiResearchKind = "ai_visibility" | "prompt_explorer";
