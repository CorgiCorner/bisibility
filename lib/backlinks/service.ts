import "server-only";
import { paymentFailure } from "@/lib/action-payment/session";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { BACKLINK_HISTORY_MONTHS } from "@/lib/providers/history-window";
import { backlinksCacheKey, withBacklinksCache } from "./cache";
import { backlinksProject, backlinksSource } from "./context";
import { backlinksEstimateEnvelope } from "./estimate";
import {
  backlinksPaymentEstimate,
  backlinksPaymentReceipt,
  prepareBacklinksPayment,
} from "./payment";
import {
  assertBacklinksMaxCost,
  BacklinksHistoryEvidenceError,
  backlinksEstimate,
  fetchBacklinksAnalysis,
} from "./provider-call";
import {
  findBacklinksSnapshot,
  findBacklinksSnapshotMetadata,
  persistBacklinksSnapshot,
  snapshotEnvelope,
} from "./snapshot";
import { normalizeBacklinksTarget } from "./target";
import type { AnalyzeBacklinksOptions, BacklinksOutcome, BacklinksServiceContext } from "./types";

export { loadMoreBacklinkRows } from "./append";
export { BacklinksSnapshotExpiredError } from "./errors";

function lookupFailure(error: unknown) {
  return error instanceof ProviderLookupSignal ? error.outcome : null;
}

function normalizedInput(options: AnalyzeBacklinksOptions) {
  const normalized = normalizeBacklinksTarget(options.target, options.targetScope);
  return {
    includeSubdomains: normalized.scope === "site" ? (options.includeSubdomains ?? true) : false,
    mode: options.mode ?? ("as_is" as const),
    resultLimit: options.resultLimit ?? 100,
    scope: normalized.scope,
    target: normalized.target,
  };
}

export async function analyzeBacklinks(
  context: BacklinksServiceContext,
  options: AnalyzeBacklinksOptions,
): Promise<BacklinksOutcome> {
  try {
    const input = normalizedInput(options);
    const now = new Date();
    const project = await backlinksProject(context.projectId);
    if (!project) return { ok: false, reason: "no_source" };
    return await withProjectCachePolicy(
      project.lookupCacheTtlSeconds,
      async (): Promise<BacklinksOutcome> => {
        if (options.provider === "unknown") {
          await prepareBacklinksPayment(context, options, project, null, null, []);
          if (options.fresh) return { ok: false, reason: "no_source" };
          const cached = await findBacklinksSnapshot({
            ...input,
            minRows: input.resultLimit,
            now,
            projectId: project.id,
            provider: "unknown",
          });
          if (!cached) return { ok: false, reason: "no_source" };
          return options.estimateOnly
            ? backlinksEstimateEnvelope({
                cachedSnapshot: cached,
                estimatedCostCents: 0,
                includeSubdomains: input.includeSubdomains,
                provider: "unknown",
                scope: input.scope,
                target: input.target,
              })
            : snapshotEnvelope(cached, { cached: true, costCents: 0, now });
        }
        const source = backlinksSource(project, options.provider, options.paymentOptionId);
        const provider = options.provider ?? source?.provider.id;

        let cachedSnapshot: { expiresAt: Date; fetchedAt: Date } | null = null;
        if (!options.fresh) {
          if (options.estimateOnly) {
            cachedSnapshot = await findBacklinksSnapshotMetadata({
              ...input,
              minRows: input.resultLimit,
              now,
              projectId: project.id,
              provider,
            });
          } else {
            const cached = await findBacklinksSnapshot({
              ...input,
              minRows: input.resultLimit,
              now,
              projectId: project.id,
              provider,
            });
            if (cached) {
              const payment = await prepareBacklinksPayment(
                context,
                options,
                project,
                source,
                [input, options.fresh ?? false],
                [
                  {
                    key: "summary",
                    costCents: 0,
                    quantity: 1,
                    cached: true,
                    freeUntil: cached.expiresAt.toISOString(),
                  },
                  ...(input.scope === "site"
                    ? [
                        {
                          key: "history",
                          costCents: 0,
                          quantity: BACKLINK_HISTORY_MONTHS,
                          cached: true,
                        },
                      ]
                    : []),
                  { key: "rows", costCents: 0, quantity: input.resultLimit, cached: true },
                ],
              );
              return {
                ...snapshotEnvelope(cached, { cached: true, costCents: 0, now }),
                ...backlinksPaymentReceipt(payment),
              };
            }
          }
        }

        if (!source) {
          await prepareBacklinksPayment(context, options, project, null, null, []);
          return { ok: false, reason: "no_source" };
        }
        const estimate = backlinksEstimate({
          resultLimit: input.resultLimit,
          scope: input.scope,
          source,
        });
        const payment = await prepareBacklinksPayment(
          context,
          options,
          project,
          source,
          [input, options.fresh ?? false],
          [
            {
              key: "summary",
              costCents: estimate.summary,
              quantity: 1,
              cached: Boolean(cachedSnapshot),
              freeUntil: cachedSnapshot?.expiresAt.toISOString(),
            },
            ...(input.scope === "site"
              ? [
                  {
                    key: "history",
                    costCents: estimate.history,
                    quantity: BACKLINK_HISTORY_MONTHS,
                    cached: Boolean(cachedSnapshot),
                  },
                ]
              : []),
            {
              key: "rows",
              costCents: estimate.rows,
              quantity: input.resultLimit,
              cached: Boolean(cachedSnapshot),
            },
          ],
        );
        if (options.estimateOnly) {
          return {
            ...backlinksPaymentEstimate(payment, project),
            ...backlinksEstimateEnvelope({
              cachedSnapshot,
              estimatedCostCents: estimate.total,
              includeSubdomains: input.includeSubdomains,
              provider: source.provider.id,
              scope: input.scope,
              target: input.target,
            }),
          };
        }

        try {
          if (options.maxCostCents !== 0)
            assertBacklinksMaxCost(estimate.total, options.maxCostCents);
          const key = backlinksCacheKey({
            includeSubdomains: input.includeSubdomains,
            mode: input.mode,
            projectId: project.id,
            provider: source.provider.id,
            resultLimit: input.resultLimit,
            scope: input.scope,
            target: input.target,
          });
          const lookup = await withBacklinksCache({
            fresh: options.fresh,
            key,
            load: async () => {
              assertBacklinksMaxCost(estimate.total, options.maxCostCents);
              const result = await fetchBacklinksAnalysis({
                ...input,
                maxCostCents: options.maxCostCents,
                origin: context.origin,
                projectId: project.id,
                source,
                payment,
              });
              const fetchedAt = new Date();
              const persisted = await persistBacklinksSnapshot({
                ...input,
                ...result,
                ...(payment ? { payment: payment.receipt() } : {}),
                fetchedAt,
                projectId: project.id,
                provider: source.provider.id,
              });
              return snapshotEnvelope(persisted, {
                cached: false,
                costCents: result.costCents,
                now: fetchedAt,
              });
            },
          });
          if (lookup.status === "contended") {
            return {
              ok: false,
              reason: "in_progress",
              resetAt: lookup.resetAt,
            };
          }
          return {
            ...(lookup.cached ? { ...lookup.value, cached: true, costCents: 0 } : lookup.value),
            ...backlinksPaymentReceipt(payment),
          };
        } catch (error) {
          const paymentError = paymentFailure(error);
          if (paymentError)
            return {
              ...paymentError,
              ...(payment?.hasAttempted ? backlinksPaymentReceipt(payment) : {}),
            };
          if (error instanceof BacklinksHistoryEvidenceError) {
            return {
              ...backlinksPaymentReceipt(payment),
              costCents: null,
              knownSummaryCostCents: error.knownSummaryCostCents,
              historyFailure: error.historyFailure,
              historyStatus: "failed",
              includeSubdomains: input.includeSubdomains,
              ok: false,
              provider: source.provider.id,
              reason: "history_failed",
              rowsStatus: "not_requested",
              status: "failed",
              summary: error.summary,
              target: input.target,
              targetScope: input.scope,
            };
          }
          const refusal = lookupFailure(error);
          if (refusal)
            return {
              ...refusal,
              ...(payment?.hasAttempted ? backlinksPaymentReceipt(payment) : {}),
            };
          if (payment?.hasAttempted)
            return { ok: false, reason: "provider_error", ...backlinksPaymentReceipt(payment) };
          throw error;
        }
      },
    );
  } catch (error) {
    const failure = paymentFailure(error);
    if (failure) return failure;
    throw error;
  }
}
