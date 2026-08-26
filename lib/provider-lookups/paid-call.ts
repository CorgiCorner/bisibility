import "server-only";

import { randomUUID } from "node:crypto";
import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import { estimatedFeatureCostCents } from "@/lib/cost-estimate/provider-rates";
import { prisma } from "@/lib/db/prisma";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import {
  LIST_PROVIDER_RATE_CONTEXT,
  type ResolveProviderRateInput,
} from "@/lib/provider-rates/resolver";
import { normalizedProviderUnitCostCents } from "@/lib/provider-rates/unit-cost";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import { recordProviderUsage } from "@/lib/provider-usage/recorder";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { chargedProviderCostCents } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { SerpProvider } from "@/lib/providers/types";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";

export type ProviderLookupFailure = {
  costCents?: number;
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

type PreflightProviderBudgetInput = {
  budgetCapCents?: number;
  estimatedCostCents: number;
  estimatedUsageQuantity?: number;
  projectId: string;
} & (
  | { connectionId: string; provider: string }
  | { connectionId?: undefined; provider?: undefined }
);

async function assertLegacyProviderBudget(input: {
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
          }),
        projectId: input.projectId,
        provider: input.provider,
      },
      prisma,
    );
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError) {
      throw new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" });
    }
    throw error;
  }
}

export async function paidProviderCall<
  T extends { costCents: number; providerRequestId?: string; usageQuantity?: number },
>(input: {
  call: (
    credentials: ReturnType<typeof resolveProviderCredentials>,
    usage: ProviderRequestAttribution,
  ) => Promise<T>;
  connection: { credentialsEncrypted: string | null; id: string; provider: string };
  feature:
    | "backlinks"
    | "domain_overview"
    | "keyword_metrics"
    | "keyword_research"
    | "ranked_keywords";
  includeClickstream?: boolean;
  itemCount: number;
  projectId: string;
  provider: SerpProvider;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
  rate: ProviderFeatureRate | null;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
}) {
  // Backlinks bills three sub-rates per call, so it has no single measured or manual rate to
  // resolve; it prices from the list rates until the rate catalog models those sub-rates.
  const context =
    input.rateContext ??
    (input.feature === "backlinks" || input.feature === "domain_overview"
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(input.connection.id, input.feature));
  const estimatedCostCents = requiredEstimatedCostCents({
    context,
    includeClickstream: input.includeClickstream,
    itemCount: input.itemCount,
    providerId: input.provider.id,
    rate: input.rate,
  });
  await assertProviderAllocationAvailable(
    {
      catalog: PROVIDER_CATALOG,
      connectionId: input.connection.id,
      estimatedCostCents,
      projectId: input.projectId,
      provider: input.provider.id,
      legacyBudgetCheck: async (capCents, estimate) =>
        preflightProviderBudget({
          budgetCapCents: capCents,
          estimatedCostCents: estimate,
          projectId: input.projectId,
        }),
    },
    prisma,
  ).catch((error) => {
    if (error instanceof ProviderAllocationExhaustedError) {
      throw new ProviderLookupSignal({ ok: false, reason: "budget_exhausted" });
    }
    throw error;
  });
  const credentials = resolveProviderCredentials(
    input.connection.provider,
    input.connection.credentialsEncrypted,
  );
  const usage = await createProviderRequestAttribution({
    correlationId: randomUUID(),
    feature: input.feature,
    projectId: input.projectId,
    source: input.source,
    trigger: input.trigger,
  });
  const gate = await consumeProviderLimit(input.provider.id, credentials, {
    projectId: input.projectId,
  });
  if (!gate.success) {
    throw new ProviderLookupSignal({ ok: false, reason: "rate_limited", resetAt: gate.resetAt });
  }
  let result: T;
  try {
    result = await input.call(credentials, usage);
  } catch (error) {
    const chargedCostCents = chargedProviderCostCents(error);
    const isAuthError = error instanceof ProviderAuthError;
    if (chargedCostCents != null) {
      try {
        await recordProviderUsage(prisma, {
          attribution: usage,
          connectionId: input.connection.id,
          costCents: chargedCostCents,
          failed: true,
          projectId: input.projectId,
          provider: input.provider.id,
          unitCostCents: normalizedProviderUnitCostCents({
            costCents: chargedCostCents,
            includeClickstream: input.includeClickstream,
            itemCount: input.itemCount,
            rate: input.rate,
          }),
        });
      } catch (recorderError) {
        if (!isAuthError) throw recorderError;
      }
    }
    if (isAuthError) {
      await Promise.resolve(
        markProviderNeedsReauth({
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: input.provider.id,
        }),
      ).catch(() => undefined);
      throw new ProviderLookupSignal({
        ...(chargedCostCents == null ? {} : { costCents: chargedCostCents }),
        ok: false,
        reason: "needs_reauth",
      });
    }
    if (error instanceof DataForSeoUnsupportedLocationError) {
      throw new ProviderLookupSignal({
        ...(chargedCostCents == null ? {} : { costCents: chargedCostCents }),
        ok: false,
        reason: "unsupported_location",
      });
    }
    throw error;
  }
  // The provider call already succeeded and has already been charged. A ledger
  // write that fails here must not cost the caller the results they paid for,
  // so this stays best-effort, as the pre-allocation code path was.
  await Promise.resolve(
    recordProviderUsage(prisma, {
      attribution: usage,
      connectionId: input.connection.id,
      costCents: result.costCents,
      failed: false,
      projectId: input.projectId,
      provider: input.provider.id,
      providerRequestId: result.providerRequestId,
      unitCostCents: normalizedProviderUnitCostCents({
        costCents: result.costCents,
        includeClickstream: input.includeClickstream,
        itemCount: input.itemCount,
        rate: input.rate,
      }),
      usageQuantity: result.usageQuantity,
    }),
  ).catch(() => undefined);
  return result;
}
