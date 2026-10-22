import "server-only";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import {
  type CachedDomainOverviewModule,
  domainOverviewFailure,
  domainOverviewReportCacheKeys,
  durableDomainOverviewModules,
  emptyDomainOverviewModule,
  loadDomainOverviewModule,
  readDomainOverviewCache,
  domainOverviewReport as report,
  settleDomainModules,
} from "./cache";
import { requireDomainOverviewSource } from "./context";
import { reportDomainOverviewFailure } from "./failure";
import { storedDomainOverviewFailure } from "./failure-details";
import {
  type DomainPayment,
  domainPaymentEstimate,
  domainPaymentReceipt,
  prepareDomainPayment,
} from "./payment";
import { retainDomainPayment } from "./payment-history";
import {
  assertDomainOverviewMaxCost,
  domainOverviewCostReservation,
  domainOverviewEstimate,
  fetchDomainKeywords,
  fetchDomainPages,
  preflightDomainOverview,
} from "./provider-call";
import {
  findDomainOverviewSnapshotMetadata,
  persistDomainOverviewModules,
  resolveDomainOverviewSnapshot,
} from "./snapshot";
import { normalizeDomainOverviewAnalysis } from "./target";
import type {
  AnalyzeDomainOverviewOptions,
  DomainOverviewOutcome,
  DomainOverviewServiceContext,
} from "./types";

export { loadDomainKeywordsPage, loadDomainPagesPage } from "./page-service";

export async function analyzeDomainOverview(
  context: DomainOverviewServiceContext,
  options: AnalyzeDomainOverviewOptions,
): Promise<DomainOverviewOutcome> {
  const paymentState: { current: DomainPayment } = { current: null };
  try {
    const input = normalizeDomainOverviewAnalysis(options);
    const { project, source } = await requireDomainOverviewSource(
      context.projectId,
      options.paymentOptionId,
    );
    return await withProjectCachePolicy(
      project.lookupCacheTtlSeconds,
      async (): Promise<DomainOverviewOutcome> => {
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
              readDomainOverviewCache<CachedDomainOverviewModule<RankedKeywordsPage>>(
                keys.keywords,
              ),
              readDomainOverviewCache<CachedDomainOverviewModule<RelevantPagesResult>>(keys.pages),
              options.estimateOnly ? readDomainOverviewCache(keys.history) : Promise.resolve(null),
            ]);
        const moduleCost =
          (keywordsCached ? 0 : estimate.keywords) + (pagesCached ? 0 : estimate.pages);
        const estimatedCostCents = stored ? 0 : estimate.overview + moduleCost;
        const payment = await prepareDomainPayment(
          context,
          options,
          project,
          source,
          ["analyze", input, options.fresh ?? false],
          [
            { key: "overview", costCents: estimate.overview, quantity: 1, cached: Boolean(stored) },
            {
              key: "keywords",
              costCents: estimate.keywords,
              quantity: input.keywordLimit,
              cached: Boolean(stored || keywordsCached),
            },
            {
              key: "pages",
              costCents: estimate.pages,
              quantity: input.pageLimit,
              cached: Boolean(stored || pagesCached),
            },
          ],
        );
        paymentState.current = payment;
        const finish = <T>(value: T) => ({ ...value, ...domainPaymentReceipt(payment) });
        if (options.estimateOnly) {
          return {
            ...input,
            ...domainPaymentEstimate(payment, project),
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
        const costLimit = requestCostLimit(options.maxCostCents);
        if (estimatedCostCents > 0) {
          await preflightDomainOverview({
            connectionId: source.connection.id,
            estimatedCostCents,
            estimatedUsageQuantity: 1 + Number(!keywordsCached) + Number(!pagesCached),
            origin: context.origin,
            projectId: project.id,
            provider: source.provider.id,
          });
        }
        const overview = await resolveDomainOverviewSnapshot({
          ...input,
          costLimit,
          beforeLoad: () => reserveCost(estimate.overview),
          payment: () => payment?.child("overview"),
          fresh: options.fresh,
          key: keys.overview,
          origin: context.origin,
          project,
          projectId: project.id,
          source,
        });
        const retain = async () => {
          if (payment)
            await retainDomainPayment({
              ...input,
              projectId: project.id,
              provider: source.provider.id,
              fetchedAt: overview.data.fetchedAt,
              receipt: payment.receipt(),
              slot: "_payment",
            });
        };
        if (overview.data.overview === null) {
          await retain();
          return finish(
            report({
              keywords: emptyDomainOverviewModule({
                consumedCount: 0,
                costCents: 0,
                rows: [],
                totalCount: 0,
              }),
              researchScope: input,
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
            }),
          );
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
            }).catch((error: unknown) => reportDomainOverviewFailure("persistence", error));
          }
          return finish(
            report({
              keywords: modules.keywords,
              researchScope: input,
              overview: overview.data,
              overviewCached: true,
              overviewCost: 0,
              pages: modules.pages,
              scope: input.scope,
              target: input.target,
            }),
          );
        }
        const [keywords, pages] = await settleDomainModules(
          [
            loadDomainOverviewModule({
              beforeLoad: () => reserveCost(estimate.keywords),
              fresh: options.fresh,
              key: keys.keywords,
              load: async () => {
                const data = await fetchDomainKeywords({
                  ...input,
                  costLimit,
                  payment: payment?.child("keywords"),
                  limit: input.keywordLimit,
                  origin: context.origin,
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
                  costLimit,
                  payment: payment?.child("pages"),
                  limit: input.pageLimit,
                  origin: context.origin,
                  offset: 0,
                  projectId: project.id,
                  source,
                });
                return { costCents: data.costCents, data };
              },
            }),
          ],
          async ([keywords, pages]) =>
            persistDomainOverviewModules({
              ...input,
              expectedFetchedAt: overview.data.fetchedAt,
              keywords: keywords.ok ? keywords.data : storedDomainOverviewFailure(keywords),
              pages: pages.ok ? pages.data : storedDomainOverviewFailure(pages),
              projectId: project.id,
              provider: source.provider.id,
            }).catch((error: unknown) => reportDomainOverviewFailure("persistence", error)),
        );
        await retain();
        return finish(
          report({
            keywords,
            researchScope: input,
            overview: overview.data,
            overviewCached: overview.cached,
            overviewCost: overview.costCents,
            pages,
            scope: input.scope,
            target: input.target,
          }),
        );
      },
    );
  } catch (error) {
    const payment = paymentState.current;
    return {
      ...domainOverviewFailure(error, payment?.hasAttempted ? payment.receipt() : undefined),
      ...(payment?.hasAttempted ? domainPaymentReceipt(payment) : {}),
    };
  }
}

export { loadDomainOverviewHistory } from "./history-service";
