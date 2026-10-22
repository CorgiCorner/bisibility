import { z } from "zod";
import { paymentBodyFields } from "./action-payment";

const commonFields = {
  ...paymentBodyFields,
  fresh: z.boolean().default(false),
  language_code: z.string().trim().min(2).max(12),
  location_code: z.number().int().positive(),
  scope_override: z.enum(["root", "subdomain"]).optional(),
  target: z.string().trim().min(1).max(253),
};

export const analyzeBodySchema = z
  .object({
    ...commonFields,
    estimate_only: z.boolean().default(false),
    keyword_limit: z.number().int().min(1).max(100).default(100),
    max_cost_cents: z.number().int().nonnegative().optional(),
    page_limit: z.number().int().min(1).max(1_000).default(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!input.estimate_only && input.max_cost_cents === undefined && !input.accepted_payment) {
      ctx.addIssue({
        code: "custom",
        message: "max_cost_cents is required unless estimate_only is true",
        path: ["max_cost_cents"],
      });
    }
  });

function requireCostConsent(
  input: { estimate_only?: boolean; max_cost_cents?: number; accepted_payment?: unknown },
  context: z.RefinementCtx,
) {
  if (!input.estimate_only && input.max_cost_cents === undefined && !input.accepted_payment)
    context.addIssue({
      code: "custom",
      path: ["max_cost_cents"],
      message: "A provider cost cap or accepted payment quote is required.",
    });
}
export const historyBodySchema = z
  .object({
    ...commonFields,
    estimate_only: z.boolean().optional(),
    max_cost_cents: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine(requireCostConsent);

const pageFields = {
  estimate_only: z.boolean().optional(),
  ...commonFields,
  max_cost_cents: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative(),
};

export const keywordPageBodySchema = z
  .object({
    ...pageFields,
    limit: z.number().int().min(1).max(100),
  })
  .strict()
  .superRefine(requireCostConsent);

export const relevantPageBodySchema = z
  .object({
    ...pageFields,
    limit: z.number().int().min(1).max(1_000),
  })
  .strict()
  .superRefine(requireCostConsent);
