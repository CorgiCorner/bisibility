import "server-only";

import {
  positiveTtl,
  readProviderLookupCache,
  withProviderLookupCache,
} from "@/lib/provider-lookups/cache";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { chargedProviderCostCents } from "@/lib/providers/call-error";
import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import type {
  DomainModuleOutcome,
  DomainOverviewLookupFailure,
  DomainOverviewMarket,
  DomainOverviewReport,
  DomainOverviewScope,
} from "./types";

export const DEFAULT_TTL_SECONDS = 43_200;

export type DomainOverviewCacheModule = "history" | "keywords" | "overview" | "pages";
export type CachedDomainOverviewModule<T> = { costCents: number; data: T; fetchedAt: string };

export function domainOverviewCacheTtlSeconds() {
  return positiveTtl(process.env.DOMAIN_OVERVIEW_CACHE_TTL_SECONDS, DEFAULT_TTL_SECONDS);
}

export function domainOverviewCachedUntil(fetchedAt: string | Date) {
  return new Date(
    new Date(fetchedAt).getTime() + domainOverviewCacheTtlSeconds() * 1000,
  ).toISOString();
}

export function domainOverviewCacheKey(input: {
  languageCode: string;
  limit?: number;
  locationCode: number;
  module: DomainOverviewCacheModule;
  offset?: number;
  projectId: string;
  provider: string;
  scope: DomainOverviewScope;
  target: string;
}) {
  const page = input.limit === undefined ? "" : `:${input.limit}:${input.offset ?? 0}`;
  return `do:v1:${input.projectId}:${input.provider}:${input.module}:${input.target}:${input.scope}:${input.locationCode}:${input.languageCode}${page}`;
}

export function domainOverviewReportCacheKeys(input: {
  keywordLimit: number;
  languageCode: string;
  locationCode: number;
  pageLimit: number;
  projectId: string;
  provider: string;
  scope: DomainOverviewScope;
  target: string;
}) {
  return {
    history: domainOverviewCacheKey({ ...input, module: "history" }),
    keywords: domainOverviewCacheKey({
      ...input,
      limit: input.keywordLimit,
      module: "keywords",
      offset: 0,
    }),
    overview: domainOverviewCacheKey({ ...input, module: "overview" }),
    pages: domainOverviewCacheKey({
      ...input,
      limit: input.pageLimit,
      module: "pages",
      offset: 0,
    }),
  };
}

export function readDomainOverviewCache<T>(key: string) {
  return readProviderLookupCache<T>(key);
}

export function withDomainOverviewCache<T>(input: {
  fresh?: boolean;
  key: string;
  load: () => Promise<T>;
}) {
  return withProviderLookupCache({ ...input, ttlSeconds: domainOverviewCacheTtlSeconds() });
}

export function domainOverviewFailure(error: unknown): DomainOverviewLookupFailure {
  return error instanceof ProviderLookupSignal
    ? { ...error.outcome, costCents: error.outcome.costCents ?? 0 }
    : { costCents: chargedProviderCostCents(error) ?? 0, ok: false, reason: "lookup_failed" };
}

export async function loadDomainOverviewModule<T>(input: {
  beforeLoad?: () => void;
  fresh?: boolean;
  key: string;
  load: () => Promise<{ costCents: number; data: T }>;
}): Promise<DomainModuleOutcome<T>> {
  try {
    const lookup = await withDomainOverviewCache({
      fresh: input.fresh,
      key: input.key,
      load: async () => {
        input.beforeLoad?.();
        return { ...(await input.load()), fetchedAt: new Date().toISOString() };
      },
    });
    if (lookup.status === "contended") {
      return { costCents: 0, ok: false, reason: "in_progress", resetAt: lookup.resetAt };
    }
    return {
      cached: lookup.cached,
      costCents: lookup.cached ? 0 : lookup.value.costCents,
      data: lookup.value.data,
      fetchedAt: lookup.value.fetchedAt,
      ok: true,
    };
  } catch (error) {
    return domainOverviewFailure(error);
  }
}

export function emptyDomainOverviewModule<T>(data: T): DomainModuleOutcome<T> {
  return { cached: true, costCents: 0, data, fetchedAt: new Date().toISOString(), ok: true };
}

export function storedDomainOverviewModule<T>(
  data: T | null,
  fetchedAt: string,
): DomainModuleOutcome<T> {
  return data === null
    ? { costCents: 0, ok: false, reason: "lookup_failed" }
    : { cached: true, costCents: 0, data, fetchedAt, ok: true };
}

function currentCachedModule<T>(
  cached: CachedDomainOverviewModule<T> | null | undefined,
  overviewFetchedAt: string,
) {
  if (!cached) return null;
  const cachedTime = Date.parse(cached.fetchedAt);
  const overviewTime = Date.parse(overviewFetchedAt);
  return Number.isFinite(cachedTime) && Number.isFinite(overviewTime) && cachedTime >= overviewTime
    ? cached
    : null;
}

export function durableDomainOverviewModules(input: {
  fetchedAt: string;
  keywords: RankedKeywordsPage | null;
  keywordsCached: CachedDomainOverviewModule<RankedKeywordsPage> | null | undefined;
  pages: RelevantPagesResult | null;
  pagesCached: CachedDomainOverviewModule<RelevantPagesResult> | null | undefined;
}) {
  const keywordsCached = currentCachedModule(input.keywordsCached, input.fetchedAt);
  const pagesCached = currentCachedModule(input.pagesCached, input.fetchedAt);
  const keywordsData = input.keywords ?? keywordsCached?.data ?? null;
  const pagesData = input.pages ?? pagesCached?.data ?? null;
  return {
    hydrate:
      (input.keywords === null && Boolean(keywordsCached?.data)) ||
      (input.pages === null && Boolean(pagesCached?.data)),
    keywords: storedDomainOverviewModule(
      keywordsData,
      input.keywords === null ? (keywordsCached?.fetchedAt ?? input.fetchedAt) : input.fetchedAt,
    ),
    keywordsData,
    pages: storedDomainOverviewModule(
      pagesData,
      input.pages === null ? (pagesCached?.fetchedAt ?? input.fetchedAt) : input.fetchedAt,
    ),
    pagesData,
  };
}

type SnapshotReportData = Pick<
  DomainOverviewReport,
  | "cachedUntil"
  | "fetchedAt"
  | "overview"
  | "previousFetchedAt"
  | "previousOverview"
  | "previousSourceSnapshotAt"
  | "provider"
  | "sourceSnapshotAt"
>;

export function domainOverviewReport(input: {
  keywords: DomainModuleOutcome<RankedKeywordsPage>;
  market: DomainOverviewMarket;
  overview: SnapshotReportData;
  overviewCached: boolean;
  overviewCost: number;
  pages: DomainModuleOutcome<RelevantPagesResult>;
  scope: DomainOverviewScope;
  target: string;
}): DomainOverviewReport {
  const modulesOk = input.keywords.ok && input.pages.ok;
  const modulesCached = [input.keywords, input.pages].every((module) =>
    module.ok ? module.cached : module.costCents === 0,
  );
  return {
    ...input.market,
    ...input.overview,
    cached: input.overviewCached && modulesCached,
    costCents: input.overviewCost + input.keywords.costCents + input.pages.costCents,
    historyMode: "lazy",
    keywords: input.keywords,
    ok: true,
    pages: input.pages,
    scope: input.scope,
    state: input.overview.overview === null ? "no_data" : modulesOk ? "ok" : "partial",
    target: input.target,
  };
}
