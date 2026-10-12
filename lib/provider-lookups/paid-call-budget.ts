import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isBudgetExhaustedError } from "@/lib/metering/admission-errors";
import { assertBudgetAvailable } from "@/lib/metering/project-budget-read";
import { advisoryProviderBudget } from "@/lib/metering/provider-budget-preview";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { ProviderLookupSignal } from "./lookup-failure";

type PreflightProviderBudgetInput = {
  estimatedCostCents: number;
  estimatedUsageQuantity?: number;
  projectId: string;
  surface: ProviderRequestSurface;
} & (
  | { connectionId: string; provider: string }
  | { connectionId?: undefined; provider?: undefined }
);

export async function preflightProviderBudget(input: PreflightProviderBudgetInput) {
  try {
    await assertBudgetAvailable(input.projectId, new Date(), {
      estimatedCostCents: input.estimatedCostCents,
    });
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    throw new ProviderLookupSignal({
      ok: false,
      provider: input.provider,
      reason: "budget_exhausted",
      budgetReason: error.budget?.reason,
      surface: input.surface,
    });
  }
  if (!input.connectionId || !input.provider) return;
  const exhausted = await advisoryProviderBudget(
    { ...input, connectionId: input.connectionId, provider: input.provider },
    prisma,
  );
  if (exhausted)
    throw new ProviderLookupSignal({
      ok: false,
      provider: input.provider,
      reason: "budget_exhausted",
      surface: input.surface,
    });
}
