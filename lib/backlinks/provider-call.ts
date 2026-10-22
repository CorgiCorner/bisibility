import "server-only";
import type { PaidCallPayment } from "@/lib/action-payment/paid-call";
import { backlinksRates } from "@/lib/cost-estimate/provider-rates";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import {
  ProviderLookupSignal,
  paidProviderCall,
  preflightProviderBudget,
  requiredEstimatedCostCents,
} from "@/lib/provider-lookups/paid-call";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { type RequestCostLimit, requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import { type ProviderRequestOrigin, surfaceOf } from "@/lib/provider-usage/surface";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { BACKLINK_HISTORY_MONTHS, previousFullHistoryMonths } from "@/lib/providers/history-window";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import type {
  BacklinkRowMode,
  BacklinkTargetInput,
  BacklinkTargetScope,
} from "@/lib/providers/types";
import { isBudgetExhaustedError } from "@/lib/rank-check/budget";
import type { BacklinksSource } from "./context";
import type { BacklinksPayment } from "./payment";
import type { BacklinksHistoryMonth } from "./types";

export { BacklinksHistoryEvidenceError } from "./history-evidence";

import { BacklinksHistoryEvidenceError } from "./history-evidence";

function rateEstimate(input: {
  itemCount: number;
  rate: ReturnType<typeof backlinksRates>["rows"];
  source: BacklinksSource;
}) {
  return requiredEstimatedCostCents({
    context: LIST_PROVIDER_RATE_CONTEXT,
    itemCount: input.itemCount,
    providerId: input.source.provider.id,
    rate: input.rate,
  });
}

export function backlinksEstimate(input: {
  resultLimit: number;
  scope: BacklinkTargetScope;
  source: BacklinksSource;
}) {
  const rates = backlinksRates(input.source.provider.id);
  const summary = rateEstimate({ itemCount: 1, rate: rates.summary, source: input.source });
  const history =
    input.scope === "site"
      ? rateEstimate({
          itemCount: BACKLINK_HISTORY_MONTHS,
          rate: rates.history,
          source: input.source,
        })
      : 0;
  const rows = rateEstimate({
    itemCount: input.resultLimit,
    rate: rates.rows,
    source: input.source,
  });
  return { history, rows, summary, total: history + rows + summary };
}

function providerTarget(input: {
  includeSubdomains: boolean;
  scope: BacklinkTargetScope;
  target: string;
}): BacklinkTargetInput {
  return {
    includeSubdomains: input.includeSubdomains,
    target: input.target,
    targetScope: input.scope,
  };
}

function paidCallInput(input: {
  costLimit?: RequestCostLimit;
  origin: ProviderRequestOrigin;
  projectId: string;
  source: BacklinksSource;
}) {
  return {
    connection: input.source.connection,
    costLimit: input.costLimit,
    credential: input.origin.credential,
    feature: "backlinks" as const,
    projectId: input.projectId,
    provider: input.source.provider,
    source: input.origin.source,
    trigger: "manual" as const,
  };
}

export async function fetchBacklinksAnalysis(input: {
  payment?: BacklinksPayment;
  maxCostCents?: number;
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  origin: ProviderRequestOrigin;
  projectId: string;
  resultLimit: number;
  scope: BacklinkTargetScope;
  source: BacklinksSource;
  target: string;
}) {
  const historyWindow = previousFullHistoryMonths(BACKLINK_HISTORY_MONTHS);
  const rates = backlinksRates(input.source.provider.id);
  const estimate = backlinksEstimate(input);
  await preflightProviderBudget({
    connectionId: input.source.connection.id,
    estimatedCostCents: estimate.total,
    estimatedUsageQuantity: input.scope === "site" ? 3 : 2,
    projectId: input.projectId,
    provider: input.source.provider.id,
    surface: surfaceOf(input.origin.source),
  });
  const target = providerTarget(input);
  const common = paidCallInput({ ...input, costLimit: requestCostLimit(input.maxCostCents) });
  const summary = await paidProviderCall({
    ...common,
    payment: input.payment?.child("summary"),
    call: (credentials, usage) =>
      input.source.provider.fetchBacklinksSummary(credentials, {
        ...target,
        attribution: usage,
        tag: usage?.tag,
      }),
    itemCount: 1,
    rate: rates.summary,
  });
  let historyUnavailable = false;
  const history =
    input.scope === "site"
      ? await paidProviderCall({
          ...common,
          payment: input.payment?.child("history"),
          call: (credentials, usage) =>
            input.source.provider.fetchBacklinksHistory(credentials, {
              ...target,
              historyWindow,
              attribution: usage,
              tag: usage?.tag,
            }),
          itemCount: BACKLINK_HISTORY_MONTHS,
          historyWindow,
          rate: rates.history,
        }).catch((error: unknown) => {
          if (
            !(error instanceof ProviderCallError) ||
            error.code !== "provider_transient" ||
            error.costCents === null ||
            !Number.isFinite(error.costCents) ||
            error.costCents < 0
          ) {
            // Keep refusal classifications authoritative; never turn them into a paid fallback.
            if (
              error instanceof ProviderLookupSignal ||
              error instanceof ProviderAuthError ||
              error instanceof DeploymentAdmissionExhaustedError ||
              isOperationAccessDeniedError(error) ||
              error instanceof ProjectReadOnlyError ||
              error instanceof ProviderRateLimitedError ||
              (error instanceof Error && isBudgetExhaustedError(error)) ||
              (error instanceof ProviderCallError && error.code !== "provider_transient") ||
              !Number.isFinite(summary.costCents) ||
              summary.costCents < 0
            )
              throw error;
            throw new BacklinksHistoryEvidenceError(error, summary.summary, summary.costCents);
          }
          historyUnavailable = true;
          return { costCents: error.costCents, rows: [] };
        })
      : { costCents: 0, rows: [] };
  const rows = await paidProviderCall({
    ...common,
    payment: input.payment?.child("rows"),
    call: (credentials, usage) =>
      input.source.provider.fetchBacklinksRows(credentials, {
        ...target,
        limit: input.resultLimit,
        mode: input.mode,
        offset: 0,
        attribution: usage,
        tag: usage?.tag,
      }),
    itemCount: input.resultLimit,
    rate: rates.rows,
  });
  const months: BacklinksHistoryMonth[] = history.rows.map((row) => ({
    lostLinks: row.lostLinks,
    lostReferringDomains: row.lostReferringDomains,
    month: row.month,
    newLinks: row.newLinks,
    newReferringDomains: row.newReferringDomains,
  }));
  return {
    costCents: summary.costCents + history.costCents + rows.costCents,
    history: months,
    ...(historyUnavailable ? { historyUnavailable: true } : {}),
    rows: rows.rows,
    summary: summary.summary,
    totalRowsAvailable: rows.totalCount,
  };
}

export async function fetchMoreBacklinksRows(input: {
  payment?: PaidCallPayment;
  maxCostCents?: number;
  correlationId?: string;
  onProviderCall?: () => void;
  onNotDispatched?: () => void;
  includeSubdomains: boolean;
  limit: number;
  mode: BacklinkRowMode;
  offset: number;
  origin: ProviderRequestOrigin;
  projectId: string;
  scope: BacklinkTargetScope;
  source: BacklinksSource;
  target: string;
}) {
  const rates = backlinksRates(input.source.provider.id);
  const target = providerTarget(input);
  return paidProviderCall({
    ...paidCallInput({
      ...input,
      costLimit:
        input.maxCostCents === undefined ? undefined : requestCostLimit(input.maxCostCents),
    }),
    payment: input.payment,
    correlationId: input.correlationId,
    onNotDispatched: input.onNotDispatched,
    call: (credentials, usage) => {
      input.onProviderCall?.();
      return input.source.provider.fetchBacklinksRows(credentials, {
        ...target,
        limit: input.limit,
        mode: input.mode,
        offset: input.offset,
        attribution: usage,
        tag: usage?.tag,
      });
    },
    itemCount: input.limit,
    rate: rates.rows,
  });
}

export function assertBacklinksMaxCost(estimatedCostCents: number, maxCostCents?: number) {
  if (maxCostCents === 0 || (maxCostCents !== undefined && estimatedCostCents > maxCostCents)) {
    throw new ProviderLookupSignal({
      estimatedCostCents,
      ok: false,
      reason: "cost_limit_exceeded",
    });
  }
}
