import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { ProviderLookupSignal } from "./lookup-failure";

type PreflightProviderBudgetInput = {
  budgetCapCents?: number;
  estimatedCostCents: number;
  estimatedUsageQuantity?: number;
  projectId: string;
  surface: ProviderRequestSurface;
} & (
  | { connectionId: string; provider: string }
  | { connectionId?: undefined; provider?: undefined }
);

async function assertLegacyProviderBudget(input: {
  budgetCapCents?: number;
  estimatedCostCents: number;
  projectId: string;
  surface: ProviderRequestSurface;
}) {
  try {
    await assertBudgetAvailable(input.projectId, new Date(), {
      capCents: input.budgetCapCents,
      estimatedCostCents: input.estimatedCostCents,
    });
  } catch (error) {
    if (isBudgetExhaustedError(error)) {
      throw new ProviderLookupSignal({
        ok: false,
        reason: "budget_exhausted",
        surface: input.surface,
      });
    }
    throw error;
  }
}

export async function preflightProviderBudget(input: PreflightProviderBudgetInput) {
  if (!input.connectionId || !input.provider) {
    return assertLegacyProviderBudget(input);
  }
  try {
    await assertProviderAllocationAvailable(
      {
        catalog: PROVIDER_CATALOG,
        connectionId: input.connectionId,
        estimatedCostCents: input.estimatedCostCents,
        estimatedUsageQuantity: input.estimatedUsageQuantity,
        legacyBudgetCheck: (capCents, estimate) =>
          assertLegacyProviderBudget({
            budgetCapCents: capCents,
            estimatedCostCents: estimate,
            projectId: input.projectId,
            surface: input.surface,
          }),
        projectId: input.projectId,
        provider: input.provider,
        surface: input.surface,
      },
      prisma,
    );
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError) {
      throw new ProviderLookupSignal({
        ok: false,
        provider: input.provider,
        reason: "budget_exhausted",
        surface: error.surface,
      });
    }
    throw error;
  }
}
