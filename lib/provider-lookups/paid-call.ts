import "server-only";

import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import { estimatedFeatureCostCents } from "@/lib/cost-estimate/provider-rates";
import { prisma } from "@/lib/db/prisma";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import {
  LIST_PROVIDER_RATE_CONTEXT,
  type ResolveProviderRateInput,
} from "@/lib/provider-rates/resolver";
import { normalizedProviderUnitCostCents } from "@/lib/provider-rates/unit-cost";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { chargedProviderCostCents } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { SerpProvider } from "@/lib/providers/types";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";

export type ProviderLookupFailure = {
  ok: false;
  reason:
    | "budget_exhausted"
    | "cost_limit_exceeded"
    | "in_progress"
    | "needs_reauth"
    | "no_source"
    | "rate_limited"
    | "unsupported_location";
  resetAt?: number;
};

export class ProviderLookupSignal extends Error {
  constructor(readonly outcome: ProviderLookupFailure) {
    super(outcome.reason);
  }
}

export function requiredEstimatedCostCents(input: {
  context: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
  includeClickstream?: boolean;
  itemCount: number;
  providerId: string;
  rate: ProviderFeatureRate | null;
}) {
  const amountCents = estimatedFeatureCostCents(
    input.rate,
    input.itemCount,
    input.includeClickstream ?? false,
    input.context,
  );
  if (amountCents === null) {
    throw new Error(`No rate configured for provider ${input.providerId}.`);
  }
  return amountCents;
}

export async function preflightProviderBudget(input: {
  budgetCapCents?: number;
  estimatedCostCents: number;
  projectId: string;
}) {
  try {
    await assertBudgetAvailable(input.projectId, new Date(), {
      capCents: input.budgetCapCents,
      estimatedCostCents: input.estimatedCostCents,
    });
  } catch (error) {
    if (isBudgetExhaustedError(error)) {
      throw new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" });
    }
    throw error;
  }
}

async function recordProviderCost(input: {
  connectionId: string;
  costCents: number;
  failed: boolean;
  feature: "backlinks" | "keyword_metrics" | "keyword_research" | "ranked_keywords";
  projectId: string;
  unitCostCents?: number | null;
}) {
  await Promise.resolve(
    prisma.providerCostEntry.create({
      data: {
        cached: false,
        connectionId: input.connectionId,
        costCents: input.costCents,
        failed: input.failed,
        feature: input.feature,
        projectId: input.projectId,
        ...(input.unitCostCents == null ? {} : { unitCostCents: input.unitCostCents }),
      },
    }),
  ).catch(() => undefined);
}

export async function paidProviderCall<T extends { costCents: number }>(input: {
  /** Cap from a project row the caller already loaded; skips the budget-gate cap query. */
  budgetCapCents?: number;
  call: (credentials: ReturnType<typeof resolveProviderCredentials>) => Promise<T>;
  connection: { credentialsEncrypted: string | null; id: string; provider: string };
  feature: "backlinks" | "keyword_metrics" | "keyword_research" | "ranked_keywords";
  includeClickstream?: boolean;
  itemCount: number;
  projectId: string;
  provider: SerpProvider;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
  rate: ProviderFeatureRate | null;
}) {
  // Backlinks bills three sub-rates per call, so it has no single measured or manual rate to
  // resolve; it prices from the list rates until the rate catalog models those sub-rates.
  const context =
    input.rateContext ??
    (input.feature === "backlinks"
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(input.connection.id, input.feature));
  const estimatedCostCents = requiredEstimatedCostCents({
    context,
    includeClickstream: input.includeClickstream,
    itemCount: input.itemCount,
    providerId: input.provider.id,
    rate: input.rate,
  });
  await preflightProviderBudget({
    budgetCapCents: input.budgetCapCents,
    estimatedCostCents,
    projectId: input.projectId,
  });
  const credentials = resolveProviderCredentials(
    input.connection.provider,
    input.connection.credentialsEncrypted,
  );
  const gate = await consumeProviderLimit(input.provider.id, credentials, {
    projectId: input.projectId,
  });
  if (!gate.success) {
    throw new ProviderLookupSignal({ ok: false, reason: "rate_limited", resetAt: gate.resetAt });
  }
  let result: T;
  try {
    result = await input.call(credentials);
  } catch (error) {
    const chargedCostCents = chargedProviderCostCents(error);
    if (chargedCostCents != null) {
      await recordProviderCost({
        connectionId: input.connection.id,
        costCents: chargedCostCents,
        failed: true,
        feature: input.feature,
        projectId: input.projectId,
        unitCostCents: normalizedProviderUnitCostCents({
          costCents: chargedCostCents,
          includeClickstream: input.includeClickstream,
          itemCount: input.itemCount,
          rate: input.rate,
        }),
      });
    }
    if (error instanceof ProviderAuthError) {
      await Promise.resolve(
        markProviderNeedsReauth({
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: input.provider.id,
        }),
      ).catch(() => undefined);
      throw new ProviderLookupSignal({ ok: false, reason: "needs_reauth" });
    }
    if (error instanceof DataForSeoUnsupportedLocationError) {
      throw new ProviderLookupSignal({ ok: false, reason: "unsupported_location" });
    }
    throw error;
  }
  await recordProviderCost({
    connectionId: input.connection.id,
    costCents: result.costCents,
    failed: false,
    feature: input.feature,
    projectId: input.projectId,
    unitCostCents: normalizedProviderUnitCostCents({
      costCents: result.costCents,
      includeClickstream: input.includeClickstream,
      itemCount: input.itemCount,
      rate: input.rate,
    }),
  });
  return result;
}
