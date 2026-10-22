import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isBudgetExhaustedError } from "@/lib/metering/admission-errors";
import { assertBudgetAvailable } from "@/lib/metering/project-budget-read";
import { connectionFunding } from "@/lib/metering/project-funding-budgets";
import { advisoryProviderBudget } from "@/lib/metering/provider-budget-preview";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { ProviderLookupSignal } from "./lookup-failure";

type PreflightProviderBudgetInput = {
  estimatedCostCents: number;
  estimatedCustomerCents?: number;
  estimatedUsageQuantity?: number;
  projectId: string;
  surface: ProviderRequestSurface;
} & (
  | { connectionId: string; provider: string }
  | { connectionId?: undefined; provider?: undefined }
);

export async function preflightProviderBudget(input: PreflightProviderBudgetInput) {
  try {
    const connection = input.connectionId
      ? await prisma.providerConnection.findFirst({
          where: { id: input.connectionId, projectId: input.projectId },
          select: { credentialSource: true },
        })
      : null;
    const funding = connectionFunding(connection?.credentialSource);
    await assertBudgetAvailable(input.projectId, new Date(), {
      // Credits limits compare the customer charge, not the provider cost.
      estimatedCostCents:
        funding === "platform"
          ? (input.estimatedCustomerCents ?? input.estimatedCostCents)
          : input.estimatedCostCents,
      funding,
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
