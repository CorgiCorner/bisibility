"use server";

import { acceptedActionPaymentSchema } from "@/lib/action-payment/schema";
import type { ActionPaymentInput } from "@/lib/action-payment/session";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { fetchRankedKeywords } from "@/lib/ranked-keywords/service";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { withLookupBudgetResult } from "./lookup-budget-result";

const rankedKeywordsSchema = z.object({
  estimateOnly: z.boolean().optional(),
  paymentOptionId: z.string().min(1).max(120).optional(),
  acceptedPayment: acceptedActionPaymentSchema.optional(),
  connectionId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => isPublicIdOfType(value, "conn"))
    .optional(),
  offset: z.coerce.number().int().min(0).max(900).multipleOf(100).default(0),
  projectId: z.string().trim().min(1).max(120),
});

export type FetchRankedKeywordSuggestionsInput = ActionPaymentInput & {
  estimateOnly?: boolean;
  connectionId?: string;
  offset?: number;
  projectId: string;
};

export async function fetchRankedKeywordSuggestions(input: unknown) {
  const data = parseActionInput(rankedKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  const result = await withLookupBudgetResult(() =>
    fetchRankedKeywords({
      actorId: actor.id,
      connectionId: data.connectionId,
      estimateOnly: data.estimateOnly,
      paymentOptionId: data.paymentOptionId,
      acceptedPayment: data.acceptedPayment,
      requirePayment: !data.estimateOnly,
      limit: 100,
      offset: data.offset,
      origin: APP_REQUEST_ORIGIN,
      projectId: project.id,
    }),
  );
  if (!result.ok)
    return {
      reason: result.reason,
      ...("payment" in result && result.payment ? { payment: result.payment } : {}),
      ...("budgetReason" in result && result.budgetReason
        ? { budgetReason: result.budgetReason }
        : {}),
    } as const;
  return result;
}
