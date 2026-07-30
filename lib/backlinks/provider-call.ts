import "server-only";

import { backlinksRates } from "@/lib/cost-estimate/provider-rates";
import {
  ProviderLookupSignal,
  paidProviderCall,
  preflightProviderBudget,
  requiredEstimatedCostCents,
} from "@/lib/provider-lookups/paid-call";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type {
  BacklinkRowMode,
  BacklinkTargetInput,
  BacklinkTargetScope,
} from "@/lib/providers/types";
import type { BacklinksSource } from "./context";
import type { BacklinksHistoryMonth } from "./types";

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
  projectId: string;
  source: BacklinksSource;
}) {
  return {
    budgetCapCents: input.budgetCapCents,
    connection: input.source.connection,
    feature: "backlinks" as const,
    projectId: input.projectId,
    provider: input.source.provider,
  };
}

export async function fetchBacklinksAnalysis(input: {
  budgetCapCents: number;
  includeSubdomains: boolean;
  mode: BacklinkRowMode;
  projectId: string;
  resultLimit: number;
  scope: BacklinkTargetScope;
  source: BacklinksSource;
  target: string;
}) {
  const rates = backlinksRates(input.source.provider.id);
  const estimate = backlinksEstimate(input);
  await preflightProviderBudget({
    budgetCapCents: input.budgetCapCents,
    estimatedCostCents: estimate.total,
    projectId: input.projectId,
  });
  const target = providerTarget(input);
  const common = paidCallInput(input);
  const summary = await paidProviderCall({
    ...common,
    call: (credentials) => input.source.provider.fetchBacklinksSummary(credentials, target),
    itemCount: 1,
    rate: rates.summary,
  });
  const history =
    input.scope === "site"
      ? await paidProviderCall({
          ...common,
          call: (credentials) => input.source.provider.fetchBacklinksHistory(credentials, target),
          itemCount: 1,
          rate: rates.history,
        })
      : { costCents: 0, rows: [] };
  const rows = await paidProviderCall({
    ...common,
    call: (credentials) =>
      input.source.provider.fetchBacklinksRows(credentials, {
        ...target,
        limit: input.resultLimit,
        mode: input.mode,
        offset: 0,
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
  projectId: string;
  scope: BacklinkTargetScope;
  source: BacklinksSource;
  target: string;
}) {
  const rates = backlinksRates(input.source.provider.id);
  const target = providerTarget(input);
  return paidProviderCall({
    ...paidCallInput(input),
    call: (credentials) =>
      input.source.provider.fetchBacklinksRows(credentials, {
        ...target,
        limit: input.limit,
        mode: input.mode,
        offset: input.offset,
      }),
    itemCount: input.limit,
    rate: rates.rows,
  });
}

export function assertBacklinksMaxCost(estimatedCostCents: number, maxCostCents?: number) {
  if (maxCostCents !== undefined && estimatedCostCents > maxCostCents) {
    throw new ProviderLookupSignal({ ok: false, reason: "cost_limit_exceeded" });
  }
}
