import "server-only";
import { readProviderLookupCache, withProviderLookupCache } from "@/lib/provider-lookups/cache";
import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import { domainOverviewFailure } from "./failure";
import { readDomainOverviewFailure, type StoredDomainOverviewModule } from "./failure-details";

export { domainOverviewFailure } from "./failure";

import { domainOverviewCacheTtlSeconds } from "./cache-policy";
import type {
  DomainModuleOutcome,
  DomainOverviewReport,
  DomainOverviewResearchScope,
  DomainOverviewScope,
} from "./types";

export {
  DEFAULT_TTL_SECONDS,
  domainOverviewCachedUntil,
  domainOverviewCacheTtlSeconds,
} from "./cache-policy";

export type DomainOverviewCacheModule = "history" | "keywords" | "overview" | "pages";
export type CachedDomainOverviewModule<T> = { costCents: number; data: T; fetchedAt?: string };

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
      fetchedAt: lookup.value.fetchedAt ?? null,
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
  data: StoredDomainOverviewModule<T>,
  fetchedAt: string,
): DomainModuleOutcome<T> {
  if (data === null) return { costCents: 0, ok: false, reason: "lookup_failed" };
  const failure = readDomainOverviewFailure(data);
  return failure
    ? { ...failure, costCents: 0, ok: false }
    : { cached: true, costCents: 0, data: data as T, fetchedAt, ok: true };
}

function currentCachedModule<T>(
  cached: CachedDomainOverviewModule<T> | null | undefined,
  overviewFetchedAt: string,
) {
  if (!cached) return null;
  const cachedTime = Date.parse(cached.fetchedAt ?? "");
  const overviewTime = Date.parse(overviewFetchedAt);
  return Number.isFinite(cachedTime) && Number.isFinite(overviewTime) && cachedTime >= overviewTime
    ? cached
    : null;
}

export function durableDomainOverviewModules(input: {
  fetchedAt: string;
  keywords: StoredDomainOverviewModule<RankedKeywordsPage>;
  keywordsCached: CachedDomainOverviewModule<RankedKeywordsPage> | null | undefined;
  pages: StoredDomainOverviewModule<RelevantPagesResult>;
  pagesCached: CachedDomainOverviewModule<RelevantPagesResult> | null | undefined;
}) {
  const keywordsCached = currentCachedModule(input.keywordsCached, input.fetchedAt);
  const pagesCached = currentCachedModule(input.pagesCached, input.fetchedAt);
  const keywordsMissing =
    input.keywords === null || Boolean(readDomainOverviewFailure(input.keywords));
  const pagesMissing = input.pages === null || Boolean(readDomainOverviewFailure(input.pages));
  const keywordsData = keywordsMissing ? (keywordsCached?.data ?? input.keywords) : input.keywords;
  const pagesData = pagesMissing ? (pagesCached?.data ?? input.pages) : input.pages;
  return {
    hydrate:
      (keywordsMissing && Boolean(keywordsCached?.data)) ||
      (pagesMissing && Boolean(pagesCached?.data)),
    keywords: storedDomainOverviewModule(
      keywordsData,
      keywordsMissing ? (keywordsCached?.fetchedAt ?? input.fetchedAt) : input.fetchedAt,
    ),
    keywordsData,
    pages: storedDomainOverviewModule(
      pagesData,
      pagesMissing ? (pagesCached?.fetchedAt ?? input.fetchedAt) : input.fetchedAt,
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
  researchScope: DomainOverviewResearchScope;
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
    ...input.researchScope,
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

/** Wait for every started child before projecting aggregate actual payment evidence. */
export async function settleDomainModules<A, B>(
  tasks: readonly [Promise<DomainModuleOutcome<A>>, Promise<DomainModuleOutcome<B>>],
  persist?: (
    modules: readonly [DomainModuleOutcome<A>, DomainModuleOutcome<B>],
  ) => Promise<unknown>,
) {
  const [first, second] = await Promise.allSettled(tasks);
  const modules = [
    first.status === "fulfilled"
      ? first.value
      : domainOverviewFailure(first.reason, undefined, true),
    second.status === "fulfilled"
      ? second.value
      : domainOverviewFailure(second.reason, undefined, true),
  ] as const;
  await persist?.(modules);
  if (first.status === "rejected") throw first.reason;
  if (second.status === "rejected") throw second.reason;
  return [first.value, second.value] as const;
}
