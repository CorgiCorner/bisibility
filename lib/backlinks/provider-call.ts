import "server-only";

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
import { type ProviderRequestOrigin, surfaceOf } from "@/lib/provider-usage/surface";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import type {
  BacklinkRowMode,
  BacklinkTargetInput,
  BacklinkTargetScope,
} from "@/lib/providers/types";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { isBudgetExhaustedError } from "@/lib/rank-check/budget";
import type { BacklinksSource } from "./context";
import type { BacklinksHistoryFailure, BacklinksHistoryMonth, BacklinksSummary } from "./types";

/** Server-only error: its cause is never projected into the failed evidence DTO. */
export class BacklinksHistoryEvidenceError extends Error {
  readonly historyFailure: BacklinksHistoryFailure;
  readonly summary: BacklinksSummary;

  constructor(
    error: unknown,
    summary: BacklinksSummary,
    readonly knownSummaryCostCents: number,
  ) {
    super("Backlinks history failed; summary evidence is available.", { cause: error });
    this.name = "BacklinksHistoryEvidenceError";
    const phases: readonly string[] = [
      "admission",
      "request",
      "response_body",
      "measurement",
      "settlement",
      "unknown",
    ];
    this.historyFailure =
      error instanceof ProviderUsagePersistenceError
        ? {
            code: "provider_usage_unconfirmed",
            phase: phases.includes(error.phase) ? error.phase : "unknown",
          }
        : {
            code: error instanceof ProviderCallError ? "provider_transient" : "unexpected_error",
            phase: null,
          };
    this.summary = {
      backlinksTotal: summary.backlinksTotal,
      brokenBacklinks: summary.brokenBacklinks,
      brokenPages: summary.brokenPages,
      dofollowPct: summary.dofollowPct,
      domainRank: summary.domainRank,
      lostBacklinks: summary.lostBacklinks,
      lostReferringDomains: summary.lostReferringDomains,
      newBacklinks: summary.newBacklinks,
      newReferringDomains: summary.newReferringDomains,
      referringDomainsTotal: summary.referringDomainsTotal,
      referringPages: summary.referringPages,
      spamScore: summary.spamScore,
    };
  }
}

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
      ? rateEstimate({ itemCount: 1, rate: rates.history, source: input.source })
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
  budgetCapCents: number;
  origin: ProviderRequestOrigin;
  projectId: string;
  source: BacklinksSource;
}) {
  return {
    connection: input.source.connection,
    credential: input.origin.credential,
    feature: "backlinks" as const,
    projectId: input.projectId,
    provider: input.source.provider,
    source: input.origin.source,
    trigger: "manual" as const,
  };
}

export async function fetchBacklinksAnalysis(input: {
  budgetCapCents: number;
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  origin: ProviderRequestOrigin;
  projectId: string;
  resultLimit: number;
  scope: BacklinkTargetScope;
  source: BacklinksSource;
  target: string;
}) {
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
  const common = paidCallInput(input);
  const summary = await paidProviderCall({
    ...common,
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
          call: (credentials, usage) =>
            input.source.provider.fetchBacklinksHistory(credentials, {
              ...target,
              attribution: usage,
              tag: usage?.tag,
            }),
          itemCount: 1,
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
  budgetCapCents: number;
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
    ...paidCallInput(input),
    call: (credentials, usage) =>
      input.source.provider.fetchBacklinksRows(credentials, {
        ...target,
        limit: input.limit,
        mode: input.mode,
        offset: input.offset,
        attribution: usage,
        tag: usage?.tag,
      }),
    itemCount: input.limit,
    rate: rates.rows,
  });
}

export function assertBacklinksMaxCost(estimatedCostCents: number, maxCostCents?: number) {
  if (maxCostCents !== undefined && estimatedCostCents > maxCostCents) {
    throw new ProviderLookupSignal({
      estimatedCostCents,
      ok: false,
      reason: "cost_limit_exceeded",
    });
  }
}
