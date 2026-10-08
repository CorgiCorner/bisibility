import "server-only";
import { randomUUID } from "node:crypto";
import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import { prisma } from "@/lib/db/prisma";
import type { ProviderCostFeature } from "@/lib/generated/prisma/client";
import { compareAdmission } from "@/lib/metering/admission";
import { withShadowRequest } from "@/lib/metering/shadow-context";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { assertOperationAccess } from "@/lib/operations/access-extension";
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
import { type ProviderCredential, surfaceOf } from "@/lib/provider-usage/surface";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { chargedProviderCostCents, ProviderCallError } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { SerpProvider } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { ProviderLookupSignal } from "./lookup-failure";
import { preflightProviderBudget } from "./paid-call-budget";
import { requiredEstimatedCostCents } from "./paid-call-estimate";
import { runHostedPaidProviderCall } from "./paid-call-hosted";
import { createOwnPaidCallJournal } from "./paid-call-own-journal";

export type { ProviderLookupFailure } from "./lookup-failure";
export { ProviderLookupSignal } from "./lookup-failure";
export { preflightProviderBudget } from "./paid-call-budget";
export { requiredEstimatedCostCents } from "./paid-call-estimate";

async function executePaidProviderCall<
  T extends { costCents: number; providerRequestId?: string; usageQuantity?: number },
>(input: {
  call: (
    credentials: ReturnType<typeof resolveProviderCredentials>,
    usage: ProviderRequestAttribution,
  ) => Promise<T>;
  connection: { credentialsEncrypted: string | null; id: string; provider: string };
  credential?: ProviderCredential;
  feature: Exclude<ProviderCostFeature, "rank_check">;
  includeClickstream?: boolean;
  itemCount: number;
  projectId: string;
  provider: SerpProvider;
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
  rate: ProviderFeatureRate | null;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
}) {
  // Access admission precedes provider credential and transport use.
  try {
    await assertOperationAccess(input.projectId);
  } catch (error) {
    if (isOperationAccessDeniedError(error))
      await compareAdmission(
        {
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: input.provider.id,
          surface: surfaceOf(input.source),
          estimatedCostCents: 0,
          shadow: { feature: input.feature, source: input.source, credential: input.credential },
        },
        "wallet_blocked",
      );
    throw error;
  }
  const currentConnection = await prisma.providerConnection.findUnique({
    select: { credentialSource: true, projectId: true, provider: true },
    where: { id: input.connection.id },
  });
  if (
    currentConnection == null ||
    currentConnection.projectId !== input.projectId ||
    currentConnection.provider !== input.provider.id ||
    input.connection.provider !== input.provider.id
  ) {
    throw new ProviderUsagePersistenceError({ cause: new Error("Provider connection mismatch.") });
  }
  // Backlinks bills three sub-rates per call, so it has no single measured or manual rate to
  // resolve; it prices from the list rates until the rate catalog models those sub-rates.
  const context =
    (currentConnection.credentialSource === "own" ? input.rateContext : undefined) ??
    (input.feature === "backlinks" ||
    input.feature === "domain_overview" ||
    input.feature === "ai_visibility" ||
    input.feature === "prompt_explorer"
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(input.connection.id, input.feature));
  const estimatedCostCents = requiredEstimatedCostCents({
    context,
    includeClickstream: input.includeClickstream,
    itemCount: input.itemCount,
    providerId: input.provider.id,
    rate: input.rate,
  });
  const surface = surfaceOf(input.source);
  if (currentConnection.credentialSource === "hosted") {
    return runHostedPaidProviderCall({
      call: input.call,
      connection: input.connection,
      credential: input.credential,
      feature: input.feature,
      itemCount: input.itemCount,
      projectId: input.projectId,
      provider: input.provider,
      source: input.source,
      trigger: input.trigger,
      estimatedCostCents,
    });
  }
  if (currentConnection.credentialSource !== "own") {
    throw new ProviderUsagePersistenceError({ cause: new Error("Unknown credential source.") });
  }
  await assertProviderAllocationAvailable(
    {
      catalog: PROVIDER_CATALOG,
      connectionId: input.connection.id,
      shadow: { feature: input.feature, source: input.source, credential: input.credential },
      estimatedCostCents,
      projectId: input.projectId,
      provider: input.provider.id,
      legacyBudgetCheck: async (capCents, estimate) =>
        preflightProviderBudget({
          budgetCapCents: capCents,
          estimatedCostCents: estimate,
          projectId: input.projectId,
          surface,
        }),
      surface,
    },
    prisma,
  ).catch(async (error) => {
    if (error instanceof ProviderLookupSignal && error.outcome.reason === "budget_exhausted")
      await compareAdmission(
        {
          connectionId: input.connection.id,
          projectId: input.projectId,
          provider: input.provider.id,
          surface,
          estimatedCostCents,
          shadow: { feature: input.feature, source: input.source, credential: input.credential },
        },
        "blocked",
      );
    if (error instanceof ProviderAllocationExhaustedError) {
      throw new ProviderLookupSignal({
        ok: false,
        provider: input.provider.id,
        reason: "budget_exhausted",
        surface: error.surface,
      });
    }
    throw error;
  });
  const ownConnection = await prisma.providerConnection.findUnique({
    select: { credentialSource: true, projectId: true, provider: true },
    where: { id: input.connection.id },
  });
  if (
    ownConnection?.credentialSource !== "own" ||
    ownConnection.projectId !== input.projectId ||
    ownConnection.provider !== input.provider.id
  ) {
    throw new ProviderUsagePersistenceError({ cause: new Error("Provider connection changed.") });
  }
  const credentials = resolveProviderCredentials(
    input.connection.provider,
    input.connection.credentialsEncrypted,
  );
  const usage = await createProviderRequestAttribution(
    {
      correlationId: randomUUID(),
      feature: input.feature,
      projectId: input.projectId,
      source: input.source,
      trigger: input.trigger,
    },
    input.credential,
  );
  const gate = await consumeProviderLimit(input.provider.id, credentials, {
    projectId: input.projectId,
  });
  if (!gate.success) {
    throw new ProviderLookupSignal({ ok: false, reason: "rate_limited", resetAt: gate.resetAt });
  }
  let result: T;
  const journal = createOwnPaidCallJournal(prisma, {
    attribution: usage,
    connection: input.connection,
    projectId: input.projectId,
    estimatedCostCents,
  });
  try {
    result = await input.call(
      journal ? { ...credentials, usageObserver: journal.observer } : credentials,
      usage,
    );
  } catch (error) {
    const chargedCostCents = journal?.started ? journal.costCents : chargedProviderCostCents(error);
    const isAuthError = error instanceof ProviderAuthError;
    if (chargedCostCents != null && !journal?.started) {
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
    if (error instanceof ProviderCallError && chargedCostCents !== null)
      throw new ProviderCallError(error.message, chargedCostCents, error.code);
    throw error;
  }
  if (journal?.started) {
    if (journal.costCents === null) throw new ProviderUsagePersistenceError();
    return { ...result, costCents: journal.costCents };
  }
  if (!journal?.started)
    await recordProviderUsage(prisma, {
      attribution: usage,
      connectionId: input.connection.id,
      costCents: result.costCents,
      failed: false,
      projectId: input.projectId,
      provider: input.provider.id,
      providerRequestId: result.providerRequestId ?? usage.context.correlationId,
      unitCostCents: normalizedProviderUnitCostCents({
        costCents: result.costCents,
        includeClickstream: input.includeClickstream,
        itemCount: input.itemCount,
        rate: input.rate,
      }),
      usageQuantity: result.usageQuantity,
    });
  return result;
}

export function paidProviderCall<
  T extends { costCents: number; providerRequestId?: string; usageQuantity?: number },
>(input: Parameters<typeof executePaidProviderCall<T>>[0]): Promise<T> {
  return withShadowRequest(() => executePaidProviderCall(input));
}
