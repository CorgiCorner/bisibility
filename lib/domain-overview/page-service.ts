import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { RankedKeywordsPage, RelevantPagesResult } from "@/lib/providers/types";
import {
  domainOverviewCacheKey,
  domainOverviewFailure,
  loadDomainOverviewModule,
  readDomainOverviewCache,
} from "./cache";
import { requireDomainOverviewSource } from "./context";
import {
  type DomainPayment,
  domainPaymentEstimate,
  domainPaymentReceipt,
  prepareDomainPayment,
} from "./payment";
import { retainDomainPayment } from "./payment-history";
import {
  assertDomainOverviewMaxCost,
  domainOverviewEstimate,
  fetchDomainKeywords,
  fetchDomainPages,
} from "./provider-call";
import { findDomainOverviewSnapshotMetadata } from "./snapshot";
import {
  domainOverviewPageLimit,
  normalizeDomainOverviewResearchScope,
  normalizeDomainOverviewTarget,
} from "./target";
import type {
  DomainModuleOutcome,
  DomainModulePaymentOutcome,
  DomainOverviewServiceContext,
  LoadDomainModuleOptions,
} from "./types";

type DomainPageData = { keywords: RankedKeywordsPage; pages: RelevantPagesResult };
type DomainPageArguments = [DomainOverviewServiceContext, LoadDomainModuleOptions];

async function loadDomainPage<T extends "keywords" | "pages">(
  context: DomainOverviewServiceContext,
  options: LoadDomainModuleOptions,
  module: T,
): Promise<DomainModulePaymentOutcome<DomainPageData[T]>> {
  const paymentState: { current: DomainPayment } = { current: null };
  try {
    const input = {
      ...normalizeDomainOverviewResearchScope(options),
      ...normalizeDomainOverviewTarget(options.target, options.scopeOverride),
      limit: domainOverviewPageLimit(options.limit, 1_000),
      offset: Math.max(0, Math.trunc(options.offset)),
    };
    const { project, source } = await requireDomainOverviewSource(
      context.projectId,
      options.paymentOptionId,
    );
    return await withProjectCachePolicy(
      project.lookupCacheTtlSeconds,
      async (): Promise<DomainModulePaymentOutcome<DomainPageData[T]>> => {
        const estimate = domainOverviewEstimate({
          keywordLimit: input.limit,
          pageLimit: input.limit,
          source,
        })[module];
        const key = domainOverviewCacheKey({
          ...input,
          module,
          projectId: project.id,
          provider: source.provider.id,
        });
        const cached =
          !options.fresh &&
          (options.estimateOnly ||
            source.provider.payment ||
            source.provider.paymentFor ||
            options.requirePayment ||
            options.acceptedPayment)
            ? await readDomainOverviewCache(key)
            : null;
        const payment = await prepareDomainPayment(
          context,
          options,
          project,
          source,
          [module, input, options.fresh ?? false],
          [{ key: module, costCents: estimate, quantity: input.limit, cached: Boolean(cached) }],
        );
        paymentState.current = payment;
        if (options.estimateOnly)
          return {
            ok: true,
            estimate: true,
            cached: Boolean(cached),
            estimatedCostCents: cached ? 0 : estimate,
            ...domainPaymentEstimate(payment, project),
          };
        const revision = payment
          ? await findDomainOverviewSnapshotMetadata({
              ...input,
              projectId: project.id,
              provider: source.provider.id,
              now: new Date(),
            })
          : null;
        const common = {
          ...input,
          costLimit: requestCostLimit(options.maxCostCents),
          origin: context.origin,
          projectId: project.id,
          source,
        };
        const load = async () => {
          const data =
            module === "keywords"
              ? await fetchDomainKeywords({ ...common, payment: payment?.child(module) })
              : await fetchDomainPages({ ...common, payment: payment?.child(module) });
          return { costCents: data.costCents, data };
        };
        const result = (await loadDomainOverviewModule({
          beforeLoad: () => assertDomainOverviewMaxCost(estimate, options.maxCostCents),
          fresh: options.fresh,
          key: domainOverviewCacheKey({
            ...input,
            module,
            projectId: project.id,
            provider: source.provider.id,
          }),
          load,
        })) as DomainModuleOutcome<DomainPageData[T]>;
        if (payment && revision)
          await retainDomainPayment({
            ...input,
            projectId: project.id,
            provider: source.provider.id,
            fetchedAt: revision.fetchedAt,
            receipt: payment.receipt(),
            slot: "_appendPayment",
          });
        return {
          ...result,
          ...(result.ok || payment?.hasAttempted ? domainPaymentReceipt(payment) : {}),
        };
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

export const loadDomainKeywordsPage = (...args: DomainPageArguments) =>
  loadDomainPage(...args, "keywords");
export const loadDomainPagesPage = (...args: DomainPageArguments) =>
  loadDomainPage(...args, "pages");
