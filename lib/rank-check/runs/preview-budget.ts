import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import { isBudgetExhaustedError } from "@/lib/metering/admission-errors";
import { type BudgetDenialReason, budgetDenialReason } from "@/lib/metering/budget-denial";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { SerpDepth } from "@/lib/serp/constants";

export type AllocationPreviewBudget =
  | { blocked: false; reason: null }
  | {
      blocked: true;
      reason: "budget_exhausted" | BudgetDenialReason;
      surface: ProviderRequestSurface;
    };

export async function allocationBudget(
  projectId: string,
  provider: string,
  connectionId: string,
  costCents: number | null,
  depths: SerpDepth[],
  surface: ProviderRequestSurface,
  estimatedCustomerCents?: number,
): Promise<AllocationPreviewBudget> {
  try {
    await assertProviderAllocationAvailable(
      {
        catalog: PROVIDER_CATALOG,
        connectionId,
        estimatedCostCents: costCents ?? 0,
        ...(estimatedCustomerCents !== undefined ? { estimatedCustomerCents } : {}),
        estimatedUsageQuantity: depths.reduce((sum, depth) => sum + pagesPerCheck(depth), 0),

        projectId,
        provider,
        surface,
      },
      prisma,
    );
    return { blocked: false, reason: null };
  } catch (error) {
    if (isBudgetExhaustedError(error)) {
      return { blocked: true, reason: budgetDenialReason(error) ?? "budget_exhausted", surface };
    }
    if (!(error instanceof ProviderAllocationExhaustedError)) throw error;
    return {
      blocked: true,
      reason: error.budgetReason ?? "budget_exhausted",
      surface: error.surface,
    };
  }
}
