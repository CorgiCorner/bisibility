"use server";

import { withAchievementUse } from "@/lib/achievements/record-use";
import { assessActionPayments } from "@/lib/action-payment/batch";
import { acceptedActionPaymentSchema } from "@/lib/action-payment/schema";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { researchKeywords } from "@/lib/keyword-research/service";
import { APP_REQUEST_ORIGIN } from "@/lib/provider-usage/surface";
import { ProviderCallError } from "@/lib/providers/call-error";
import { canonicalKeySchema } from "@/lib/schemas/keyword";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";
import { withLookupBudgetResult } from "./lookup-budget-result";

const researchKeywordsActionSchema = z.object({
  paymentOptionId: z.string().min(1).max(120).optional(),
  acceptedPayment: acceptedActionPaymentSchema.optional(),
  connectionId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => isPublicIdOfType(value, "conn"))
    .optional(),
  estimateOnly: z.boolean().default(false),
  fresh: z.boolean().default(false),
  includeClickstream: z.boolean().default(false),
  locationKey: canonicalKeySchema.optional(),
  maxCostCents: z.number().int().nonnegative().optional(),
  mode: z.enum(["auto", "related", "suggestions", "ideas"]).default("auto"),
  projectId: z.string().trim().min(1).max(120),
  resultLimit: z.union([z.literal(100), z.literal(300), z.literal(500)]).default(100),
  seed: z.string().trim().min(1).max(80),
});

export type ResearchKeywordsActionInput = z.input<typeof researchKeywordsActionSchema>;
export type ResearchKeywordsAction = typeof researchKeywordsAction;

export async function researchKeywordsAction(input: unknown) {
  const data = parseActionInput(researchKeywordsActionSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });

  try {
    return await withAchievementUse(actor.id, "researchKeywords", data.estimateOnly, () =>
      withLookupBudgetResult(() =>
        researchKeywords({
          ...data,
          requirePayment: !data.estimateOnly,
          actorId: actor.id,
          origin: APP_REQUEST_ORIGIN,
          projectId: project.id,
        }),
      ),
    );
  } catch (error) {
    if (error instanceof ProviderCallError && error.code === "provider_account_restricted") {
      return {
        ...(error.costCents == null ? {} : { costCents: error.costCents }),
        ok: false as const,
        reason: "account_restricted" as const,
      };
    }
    throw error;
  }
}

export async function assessResearchPaymentsAction(input: unknown) {
  const data = z
    .object({
      projectId: z.string().min(1).max(120),
      quotes: z.array(acceptedActionPaymentSchema).min(1).max(50),
    })
    .parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, { type: "keyword" });
  return assessActionPayments({ projectId: project.id, actorId: actor.id, quotes: data.quotes });
}
