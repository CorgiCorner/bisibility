import {
  BudgetExhaustedError,
  ProviderAllocationExhaustedError,
} from "@/lib/metering/admission-errors";
import type { RequestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import { surfaceOf } from "@/lib/provider-usage/surface";
import "server-only";
import { randomUUID } from "node:crypto";
import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";
import { prisma } from "@/lib/db/prisma";
import type { ProviderCostFeature } from "@/lib/generated/prisma/client";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import { ProviderQuoteUnavailableError } from "@/lib/provider-rates/native-quote";
import {
  LIST_PROVIDER_RATE_CONTEXT,
  type ResolveProviderRateInput,
} from "@/lib/provider-rates/resolver";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import {
  createProviderRequestAttribution,
  type ProviderRequestAttribution,
  type ProviderRequestSource,
  type ProviderRequestTrigger,
} from "@/lib/provider-usage/tag";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { chargedProviderCostCents, ProviderCallError } from "@/lib/providers/call-error";
import { ProviderCostLimitError } from "@/lib/providers/cost-limit";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import type { ProviderHistoryWindow } from "@/lib/providers/history-window";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import { DataForSeoUnsupportedLocationError } from "@/lib/providers/serp/dataforseo";
import type { SerpProvider } from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { requiredConnectionEstimate } from "./connection-estimate";
import { ProviderLookupSignal } from "./lookup-failure";
import { assertOwnCredentialSnapshot } from "./own-credential-guard";
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
  correlationId?: string;
  feature: Exclude<ProviderCostFeature, "rank_check" | "local_scan">;
  includeClickstream?: boolean;
  historyWindow?: ProviderHistoryWindow;
  itemCount: number;
  maxCostCents?: number;
  costLimit?: RequestCostLimit;
  projectId: string;
  provider: SerpProvider;
  requiredCredentialSource?: "own";
  rateContext?: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
  rate: ProviderFeatureRate | null;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
}) {
  await assertOperationAccess(input.projectId);
  const currentConnection = await prisma.providerConnection.findUnique({
    select: { credentialSource: true, projectId: true, provider: true, credentialsEncrypted: true },
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
  assertOwnCredentialSnapshot(input, currentConnection);
  const context =
    (input.provider.id === "dataforseo" && currentConnection.credentialSource === "own"
      ? LIST_PROVIDER_RATE_CONTEXT
      : input.rateContext) ??
    (input.feature === "backlinks" ||
    input.feature === "domain_overview" ||
    input.feature === "ai_visibility" ||
    input.feature === "ai_tracking" ||
    input.feature === "prompt_explorer"
      ? LIST_PROVIDER_RATE_CONTEXT
      : await loadProviderRateContext(input.connection.id, input.feature));
  if (currentConnection.credentialSource === "hosted") {
    return runHostedPaidProviderCall({
      call: input.call,
      connection: input.connection,
      credential: input.credential,
      correlationId: input.correlationId,
      feature: input.feature,
      itemCount: input.itemCount,
      maxCostCents: input.maxCostCents,
      costLimit: input.costLimit,
      projectId: input.projectId,
      provider: input.provider,
      source: input.source,
      trigger: input.trigger,
      estimatedCostCents: requiredEstimatedCostCents({
        context: LIST_PROVIDER_RATE_CONTEXT,
        includeClickstream: input.includeClickstream,
        itemCount: input.itemCount,
        providerId: input.provider.id,
        rate: input.rate,
      }),
    }).catch((error: unknown) => {
      if (error instanceof ProviderCostLimitError)
        throw new ProviderLookupSignal({
          ok: false,
          reason: "cost_limit_exceeded",
          estimatedCostCents: error.estimatedCostCents,
        });
      throw error;
    });
  }
  if (currentConnection.credentialSource !== "own") {
    throw new ProviderUsagePersistenceError({ cause: new Error("Unknown credential source.") });
  }
  const ownConnection = await prisma.providerConnection.findUnique({
    select: { credentialSource: true, projectId: true, provider: true, credentialsEncrypted: true },
    where: { id: input.connection.id },
  });
  if (
    ownConnection?.credentialSource !== "own" ||
    ownConnection.projectId !== input.projectId ||
    ownConnection.provider !== input.provider.id
  ) {
    throw new ProviderUsagePersistenceError({ cause: new Error("Provider connection changed.") });
  }
  assertOwnCredentialSnapshot(input, ownConnection);
  const estimatedCostCents = await requiredConnectionEstimate({
    connection: input.connection,
    feature: input.feature,
    context,
    includeClickstream: input.includeClickstream,
    historyWindow: input.historyWindow,
    itemCount: input.itemCount,
    providerId: input.provider.id,
    rate: input.rate,
  }).catch((cause: unknown) => {
    if (cause instanceof ProviderQuoteUnavailableError)
      throw new ProviderUsagePersistenceError({ cause, phase: "admission" });
    throw cause;
  });
  const credentials = resolveProviderCredentials(
    input.connection.provider,
    input.connection.credentialsEncrypted,
  );
  const usage = await createProviderRequestAttribution(
    {
      correlationId: input.correlationId ?? randomUUID(),
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
    maxCostCents: input.maxCostCents,
    costLimit: input.costLimit,
  });
  try {
    result = await input.call(
      journal ? { ...credentials, usageObserver: journal.observer } : credentials,
      usage,
    );
  } catch (error) {
    if (error instanceof ProviderCostLimitError)
      throw new ProviderLookupSignal({
        ok: false,
        reason: "cost_limit_exceeded",
        estimatedCostCents: (journal.costCents ?? 0) + error.estimatedCostCents,
        ...(journal.started && journal.costCents !== null ? { costCents: journal.costCents } : {}),
      });
    if (error instanceof BudgetExhaustedError || error instanceof ProviderAllocationExhaustedError)
      throw new ProviderLookupSignal({
        ok: false,
        reason: "budget_exhausted",
        ...(error instanceof BudgetExhaustedError ? { budgetReason: error.budget.reason } : {}),
        provider: input.provider.id,
        surface: surfaceOf(input.source),
      });
    const chargedCostCents = journal?.started ? journal.costCents : chargedProviderCostCents(error);
    const isAuthError = error instanceof ProviderAuthError;
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
  throw new ProviderUsagePersistenceError({
    cause: new Error("Paid transport did not retain accounting evidence"),
  });
}

export function paidProviderCall<
  T extends { costCents: number; providerRequestId?: string; usageQuantity?: number },
>(input: Parameters<typeof executePaidProviderCall<T>>[0]): Promise<T> {
  return executePaidProviderCall(input);
}
