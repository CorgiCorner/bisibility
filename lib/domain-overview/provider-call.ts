import "server-only";

import { domainOverviewRates, rankedKeywordPageRate } from "@/lib/cost-estimate/provider-rates";
import {
  ProviderLookupSignal,
  paidProviderCall,
  preflightProviderBudget,
  requiredEstimatedCostCents,
} from "@/lib/provider-lookups/paid-call";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { SerpRankLocation } from "@/lib/serp/location";
import type { DomainOverviewSource } from "./context";
import type { DomainOverviewMarket, DomainOverviewScope } from "./types";

function estimate(input: {
  itemCount: number;
  rate: Parameters<typeof requiredEstimatedCostCents>[0]["rate"];
  source: DomainOverviewSource;
}) {
  return requiredEstimatedCostCents({
    context: LIST_PROVIDER_RATE_CONTEXT,
    itemCount: input.itemCount,
    providerId: input.source.provider.id,
    rate: input.rate,
  });
}

export function domainOverviewEstimate(input: {
  keywordLimit: number;
  pageLimit: number;
  source: DomainOverviewSource;
}) {
  const rates = domainOverviewRates(input.source.provider.id);
  const overview = estimate({ itemCount: 1, rate: rates.overview, source: input.source });
  const history = estimate({ itemCount: 1, rate: rates.history, source: input.source });
  const keywords = estimate({
    itemCount: input.keywordLimit,
    rate: rankedKeywordPageRate(input.source.provider.id),
    source: input.source,
  });
  const pages = estimate({ itemCount: input.pageLimit, rate: rates.pages, source: input.source });
  return { core: overview + keywords + pages, history, keywords, overview, pages };
}

function paidCallInput(input: {
  budgetCapCents: number;
  projectId: string;
  source: DomainOverviewSource;
}) {
  return {
    budgetCapCents: input.budgetCapCents,
    connection: input.source.connection,
    feature: "domain_overview" as const,
    projectId: input.projectId,
    provider: input.source.provider,
  };
}

function providerLocation(market: DomainOverviewMarket): SerpRankLocation {
  return {
    gl: "",
    hl: market.languageCode,
    primaryGeoCode: market.locationCode,
    primaryGeoName: "",
    secondaryGeoName: "",
  };
}

function providerTarget(
  input: DomainOverviewMarket & {
    scope: DomainOverviewScope;
    target: string;
  },
) {
  return {
    includeSubdomains: input.scope === "root",
    languageCode: input.languageCode,
    location: providerLocation(input),
    locationCode: input.locationCode,
    target: input.target,
  };
}

export function assertDomainOverviewMaxCost(estimatedCostCents: number, maxCostCents?: number) {
  if (maxCostCents !== undefined && estimatedCostCents > maxCostCents) {
    throw new ProviderLookupSignal({ ok: false, reason: "cost_limit_exceeded" });
  }
}

export function domainOverviewCostReservation(maxCostCents: number | undefined) {
  let reserved = 0;
  return (nextCostCents: number) => {
    assertDomainOverviewMaxCost(reserved + nextCostCents, maxCostCents);
    reserved += nextCostCents;
  };
}

export function preflightDomainOverview(input: {
  budgetCapCents: number;
  estimatedCostCents: number;
  projectId: string;
}) {
  return preflightProviderBudget(input);
}

export function fetchDomainOverviewMetrics(
  input: DomainOverviewMarket & {
    budgetCapCents: number;
    projectId: string;
    scope: DomainOverviewScope;
    source: DomainOverviewSource;
    target: string;
  },
) {
  return paidProviderCall({
    ...paidCallInput(input),
    call: (credentials) =>
      input.source.provider.fetchDomainRankOverview(credentials, providerTarget(input)),
    itemCount: 1,
    rate: domainOverviewRates(input.source.provider.id).overview,
  });
}

export function fetchDomainHistory(
  input: DomainOverviewMarket & {
    budgetCapCents: number;
    projectId: string;
    scope: DomainOverviewScope;
    source: DomainOverviewSource;
    target: string;
  },
) {
  return paidProviderCall({
    ...paidCallInput(input),
    call: (credentials) =>
      input.source.provider.fetchHistoricalRankOverview(credentials, providerTarget(input)),
    itemCount: 1,
    rate: domainOverviewRates(input.source.provider.id).history,
  });
}

export function fetchDomainKeywords(
  input: DomainOverviewMarket & {
    budgetCapCents: number;
    limit: number;
    offset: number;
    projectId: string;
    source: DomainOverviewSource;
    target: string;
  },
) {
  return paidProviderCall({
    ...paidCallInput(input),
    call: (credentials) =>
      input.source.provider.fetchRankedKeywords(credentials, {
        domain: input.target,
        languageCode: input.languageCode,
        limit: input.limit,
        location: providerLocation(input),
        locationCode: input.locationCode,
        offset: input.offset,
      }),
    itemCount: input.limit,
    rate: rankedKeywordPageRate(input.source.provider.id),
  });
}

export function fetchDomainPages(
  input: DomainOverviewMarket & {
    budgetCapCents: number;
    limit: number;
    offset: number;
    projectId: string;
    scope: DomainOverviewScope;
    source: DomainOverviewSource;
    target: string;
  },
) {
  return paidProviderCall({
    ...paidCallInput(input),
    call: (credentials) =>
      input.source.provider.fetchRelevantPages(credentials, {
        ...providerTarget(input),
        limit: input.limit,
        offset: input.offset,
      }),
    itemCount: input.limit,
    rate: domainOverviewRates(input.source.provider.id).pages,
  });
}
