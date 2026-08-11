import { z } from "zod";

const projectId = z.string().trim().min(1).max(120);
const moneyInput = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter a positive amount with up to two decimals.");

export const hostedPricingFeedbackSchema = z.object({
  monthlyPrice: z
    .string()
    .trim()
    .regex(/^[1-9]\d{0,3}$/, "Enter a whole-dollar amount from 1 to 9999."),
  projectId,
});

export const usageBudgetSchema = z
  .object({
    budgetDollars: moneyInput,
    projectId,
  })
  .refine((value) => Number(value.budgetDollars) > 0, {
    message: "Enter a positive monthly budget.",
    path: ["budgetDollars"],
  })
  .refine((value) => Number(value.budgetDollars) <= 1_000_000, {
    message: "Monthly budget must be $1,000,000 or less.",
    path: ["budgetDollars"],
  });

export type HostedPricingFeedbackInput = z.infer<typeof hostedPricingFeedbackSchema>;
export type UsageBudgetInput = z.infer<typeof usageBudgetSchema>;

export function budgetInputToCents(value: UsageBudgetInput) {
  return Math.round(Number(value.budgetDollars) * 100);
}
