import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import type { ProviderRequestSurface } from "@/lib/provider-usage/surface";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import type { SerpDepth } from "@/lib/serp/constants";

export type AllocationPreviewBudget =
  | { blocked: false; reason: null }
  | { blocked: true; reason: "budget_exhausted"; surface: ProviderRequestSurface };

export async function allocationBudget(
  projectId: string,
  provider: string,
  connectionId: string,
  costCents: number | null,
  depths: SerpDepth[],
  surface: ProviderRequestSurface,
): Promise<AllocationPreviewBudget> {
  try {
    await assertProviderAllocationAvailable(
      {
        catalog: PROVIDER_CATALOG,
        connectionId,
        estimatedCostCents: costCents ?? 0,
        estimatedUsageQuantity: depths.reduce((sum, depth) => sum + pagesPerCheck(depth), 0),
        legacyBudgetCheck: async () => undefined,
        projectId,
        provider,
        surface,
      },
      prisma,
    );
    return { blocked: false, reason: null };
  } catch (error) {
    if (!(error instanceof ProviderAllocationExhaustedError)) throw error;
    return { blocked: true, reason: "budget_exhausted", surface: error.surface };
  }
}
