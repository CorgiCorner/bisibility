import "server-only";

import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import {
  type CachedDomainOverviewModule,
  domainOverviewCacheKey as cacheKey,
  domainOverviewFailure,
  domainOverviewReportCacheKeys,
  durableDomainOverviewModules,
  emptyDomainOverviewModule,
  loadDomainOverviewModule,
  readDomainOverviewCache,
  domainOverviewReport as report,
} from "./cache";
import { requireDomainOverviewSource } from "./context";
import {
  assertDomainOverviewMaxCost,
  domainOverviewCostReservation,
  domainOverviewEstimate,
  fetchDomainHistory,
  fetchDomainKeywords,
  fetchDomainPages,
  preflightDomainOverview,
} from "./provider-call";
import {
  findDomainOverviewSnapshot,
  findDomainOverviewSnapshotMetadata,
  persistDomainOverviewHistory,
  persistDomainOverviewModules,
  resolveDomainOverviewSnapshot,
} from "./snapshot";
import {
  normalizeDomainOverviewAnalysis,
  normalizeDomainOverviewMarket,
  normalizeDomainOverviewTarget,
} from "./target";
import type {
  AnalyzeDomainOverviewOptions,
  DomainHistoryOutcome,
  DomainOverviewOutcome,
  DomainOverviewServiceContext,
  LoadDomainHistoryOptions,
} from "./types";

export { loadDomainKeywordsPage, loadDomainPagesPage } from "./page-service";

export async function analyzeDomainOverview(
  context: DomainOverviewServiceContext,
  options: AnalyzeDomainOverviewOptions,
): Promise<DomainOverviewOutcome> {
  try {
    const input = normalizeDomainOverviewAnalysis(options);
    const { project, source } = await requireDomainOverviewSource(context.projectId);
    const estimate = domainOverviewEstimate({
      keywordLimit: input.keywordLimit,
      pageLimit: input.pageLimit,
      source,
    });
    const keys = domainOverviewReportCacheKeys({
      ...input,
      projectId: project.id,
      provider: source.provider.id,
    });
    const [stored, keywordsCached, pagesCached, historyCached] = options.fresh
      ? [null, null, null, null]
      : await Promise.all([
          findDomainOverviewSnapshotMetadata({
            ...input,
            now: new Date(),
            projectId: project.id,
            provider: source.provider.id,
          }),
          readDomainOverviewCache<CachedDomainOverviewModule<RankedKeywordsPage>>(keys.keywords),
          readDomainOverviewCache<CachedDomainOverviewModule<RelevantPagesResult>>(keys.pages),
          options.estimateOnly ? readDomainOverviewCache(keys.history) : Promise.resolve(null),
        ]);
    const moduleCost =
      (keywordsCached ? 0 : estimate.keywords) + (pagesCached ? 0 : estimate.pages);
    const estimatedCostCents = stored ? 0 : estimate.overview + moduleCost;
    if (options.estimateOnly) {
      return {
        ...input,
        cached: estimatedCostCents === 0,
        estimate: true,
        estimatedCostCents,
        freshEstimatedCostCents: estimate.overview + estimate.keywords + estimate.pages,
        historyEstimatedCostCents: historyCached ? 0 : estimate.history,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: estimate.keywords,
        ok: true,
        pagePageEstimatedCostCents: estimate.pages,
        provider: source.provider.id,
      };
    }
    assertDomainOverviewMaxCost(estimatedCostCents, options.maxCostCents);
    const reserveCost = domainOverviewCostReservation(options.maxCostCents);
    if (estimatedCostCents > 0) {
      await preflightDomainOverview({
        budgetCapCents: project.budgetCapCents,
        estimatedCostCents,
        projectId: project.id,
      });
    }
    const overview = await resolveDomainOverviewSnapshot({
      ...input,
      beforeLoad: () => reserveCost(estimate.overview),
      fresh: options.fresh,
      key: keys.overview,
      project,
      projectId: project.id,
      source,
    });
    if (overview.data.overview === null) {
      return report({
        keywords: emptyDomainOverviewModule({
          consumedCount: 0,
          costCents: 0,
          rows: [],
          totalCount: 0,
        }),
        market: input,
        overview: overview.data,
        overviewCached: overview.cached,
        overviewCost: overview.costCents,
        pages: emptyDomainOverviewModule({
          consumedCount: 0,
          costCents: 0,
          rows: [],
          totalCount: 0,
        }),
        scope: input.scope,
        target: input.target,
      });
    }
    if (overview.durable) {
      const modules = durableDomainOverviewModules({
        fetchedAt: overview.data.fetchedAt,
        keywords: overview.modules.keywords,
        keywordsCached,
        pages: overview.modules.pages,
        pagesCached,
      });
      if (modules.hydrate) {
        await persistDomainOverviewModules({
          ...input,
          expectedFetchedAt: overview.data.fetchedAt,
          keywords: modules.keywordsData,
          pages: modules.pagesData,
          projectId: project.id,
          provider: source.provider.id,
        }).catch(() => undefined);
      }
      return report({
        keywords: modules.keywords,
        market: input,
        overview: overview.data,
        overviewCached: true,
        overviewCost: 0,
        pages: modules.pages,
        scope: input.scope,
        target: input.target,
      });
    }
    const [keywords, pages] = await Promise.all([
      loadDomainOverviewModule({
        beforeLoad: () => reserveCost(estimate.keywords),
        fresh: options.fresh,
        key: keys.keywords,
        load: async () => {
          const data = await fetchDomainKeywords({
            ...input,
            budgetCapCents: project.budgetCapCents,
            limit: input.keywordLimit,
            offset: 0,
            projectId: project.id,
            source,
          });
          return { costCents: data.costCents, data };
        },
      }),
      loadDomainOverviewModule({
        beforeLoad: () => reserveCost(estimate.pages),
        fresh: options.fresh,
        key: keys.pages,
        load: async () => {
          const data = await fetchDomainPages({
            ...input,
            budgetCapCents: project.budgetCapCents,
            limit: input.pageLimit,
            offset: 0,
            projectId: project.id,
            source,
          });
          return { costCents: data.costCents, data };
        },
      }),
    ]);
    await persistDomainOverviewModules({
      ...input,
      expectedFetchedAt: overview.data.fetchedAt,
      keywords: keywords.ok ? keywords.data : null,
      pages: pages.ok ? pages.data : null,
      projectId: project.id,
      provider: source.provider.id,
    }).catch(() => undefined);
    return report({
      keywords,
      market: input,
      overview: overview.data,
      overviewCached: overview.cached,
      overviewCost: overview.costCents,
      pages,
      scope: input.scope,
      target: input.target,
    });
  } catch (error) {
    return domainOverviewFailure(error);
  }
}

export async function loadDomainOverviewHistory(
  context: DomainOverviewServiceContext,
  options: LoadDomainHistoryOptions,
): Promise<DomainHistoryOutcome> {
  try {
    const input = {
      ...normalizeDomainOverviewMarket(options),
      ...normalizeDomainOverviewTarget(options.target, options.scopeOverride),
    };
    const { project, source } = await requireDomainOverviewSource(context.projectId);
    const estimate = domainOverviewEstimate({ keywordLimit: 1, pageLimit: 1, source });
    const stored = await findDomainOverviewSnapshot({
      ...input,
      now: new Date(),
      projectId: project.id,
      provider: source.provider.id,
    });
    if (!stored) return { costCents: 0, ok: false, reason: "snapshot_expired" };
    const key = cacheKey({
      ...input,
      module: "history",
      projectId: project.id,
      provider: source.provider.id,
    });
    return loadDomainOverviewModule({
      beforeLoad: () => assertDomainOverviewMaxCost(estimate.history, options.maxCostCents),
      fresh: options.fresh,
      key,
      load: async () => {
        const result = await fetchDomainHistory({
          ...input,
          budgetCapCents: project.budgetCapCents,
          projectId: project.id,
          source,
        });
        await persistDomainOverviewHistory({
          ...input,
          history: result.rows,
          projectId: project.id,
        });
        return { costCents: result.costCents, data: result.rows };
      },
    });
  } catch (error) {
    return domainOverviewFailure(error);
  }
}
