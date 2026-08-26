import { MAX_ALLOCATION_AMOUNT } from "@/lib/provider-allocations/types";
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

export type HostedPricingFeedbackInput = z.infer<typeof hostedPricingFeedbackSchema>;

export function budgetInputToCents(value: { budgetDollars: string }) {
  return Math.round(Number(value.budgetDollars) * 100);
}

const providerConnectionId = z
  .string()
  .trim()
  .regex(/^conn_[a-z0-9]+$/, "Invalid provider connection.");
const providerAllocationDollars = moneyInput
  .refine((value) => Number(value) > 0, {
    message: "Enter a positive monthly budget.",
  })
  .refine((value) => budgetInputToCents({ budgetDollars: value }) <= MAX_ALLOCATION_AMOUNT, {
    message: "Monthly budget is too large.",
  });

export const providerAllocationSchema = z.object({
  allocation: z.union([
    z.null(),
    z.object({ amountDollars: providerAllocationDollars, unit: z.literal("cents") }),
    z.object({
      amount: z.coerce
        .number()
        .int("Enter a whole number of units.")
        .min(1, "Enter a positive number of units.")
        .max(MAX_ALLOCATION_AMOUNT, "Monthly allocation is too large."),
      unit: z.literal("units"),
    }),
  ]),
  connectionId: providerConnectionId,
});

export type ProviderAllocationInput = z.infer<typeof providerAllocationSchema>;
