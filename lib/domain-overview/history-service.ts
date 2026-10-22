import "server-only";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { requestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import { DOMAIN_HISTORY_MONTHS } from "@/lib/providers/history-window";
import {
  domainOverviewCacheKey as cacheKey,
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
  fetchDomainHistory,
} from "./provider-call";
import { findDomainOverviewSnapshot, persistDomainOverviewHistory } from "./snapshot";
import { normalizeDomainOverviewResearchScope, normalizeDomainOverviewTarget } from "./target";
import type {
  DomainHistoryOutcome,
  DomainOverviewServiceContext,
  DomainPaymentEstimate,
  LoadDomainHistoryOptions,
} from "./types";
export async function loadDomainOverviewHistory(
  context: DomainOverviewServiceContext,
  options: LoadDomainHistoryOptions,
): Promise<DomainHistoryOutcome | DomainPaymentEstimate> {
  const paymentState: { current: DomainPayment } = { current: null };
  try {
    const input = {
      ...normalizeDomainOverviewResearchScope(options),
      ...normalizeDomainOverviewTarget(options.target, options.scopeOverride),
    };
    const { project, source } = await requireDomainOverviewSource(
      context.projectId,
      options.paymentOptionId,
    );
    return await withProjectCachePolicy(
      project.lookupCacheTtlSeconds,
      async (): Promise<DomainHistoryOutcome | DomainPaymentEstimate> => {
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
          ["history", input, options.fresh ?? false],
          [
            {
              key: "history",
              costCents: estimate.history,
              quantity: DOMAIN_HISTORY_MONTHS,
              cached: Boolean(cached),
            },
          ],
        );
        paymentState.current = payment;
        if (options.estimateOnly)
          return {
            ok: true,
            estimate: true,
            cached: Boolean(cached),
            estimatedCostCents: cached ? 0 : estimate.history,
            ...domainPaymentEstimate(payment, project),
          };
        const result = await loadDomainOverviewModule({
          beforeLoad: () => assertDomainOverviewMaxCost(estimate.history, options.maxCostCents),
          fresh: options.fresh,
          key,
          load: async () => {
            const result = await fetchDomainHistory({
              ...input,
              costLimit: requestCostLimit(options.maxCostCents),
              payment: payment?.child("history"),
              origin: context.origin,
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
        if (payment)
          await retainDomainPayment({
            ...input,
            projectId: project.id,
            provider: source.provider.id,
            fetchedAt: stored.fetchedAt,
            receipt: payment.receipt(),
            slot: "_historyPayment",
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
