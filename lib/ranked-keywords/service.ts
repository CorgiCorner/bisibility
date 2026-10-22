import "server-only";
import { paymentAdmissionFailure } from "@/lib/action-payment/admission-failure";
import type { ActionPaymentQuote, ActionPaymentReceipt } from "@/lib/action-payment/contract";
import {
  enumerateActionPaymentOptions,
  selectActionPaymentCandidate,
} from "@/lib/action-payment/options";
import type { ActionPaymentInput } from "@/lib/action-payment/session";
import { paymentFailure } from "@/lib/action-payment/session";
import { providerLookupCacheConfigured } from "@/lib/provider-lookups/cache";
import { annotate, eligibleConnections, projectState, resolvedLocation } from "./context";

export { listEligibleRankedKeywordConnections } from "./context";

import { requireApiPublicId } from "@/lib/api/public-id";
import { rankedKeywordPageRate } from "@/lib/cost-estimate/provider-rates";
import { normalizeDomain } from "@/lib/domains/normalize";
import type { BudgetDenialReason } from "@/lib/metering/budget-denial";
import { requiredConnectionEstimate } from "@/lib/provider-lookups/connection-estimate";
import { ProviderLookupSignal, paidProviderCall } from "@/lib/provider-lookups/paid-call";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import type { RankedKeywordRow } from "@/lib/providers/types";
import { trackedProjectDomain } from "@/lib/schemas/project";
import {
  type RankedKeywordsCacheEntry,
  rankedKeywordsCacheKey,
  readRankedKeywordsCache,
  withRankedKeywordsCache,
} from "./cache";
import { prepareRankedKeywordPayment } from "./payment";

export type RankedKeywordConnection = { id: string; label: string; provider: string };
export type RankedKeywordSuggestion = RankedKeywordRow & { alreadyTracked: boolean };
export type RankedKeywordsSuccess = {
  freeUntil?: string | null;
  payment?: ActionPaymentReceipt;
  originalPayment?: ActionPaymentReceipt;
  cached: boolean;
  connections: RankedKeywordConnection[];
  costCents: number;
  fetchedAt: string;
  offset: number;
  rows: RankedKeywordSuggestion[];
  totalCount: number | null;
};
export type RankedKeywordsEstimate = Omit<RankedKeywordsSuccess, "payment"> & {
  estimate: true;
  payment?: ActionPaymentQuote;
  paymentOptions?: import("@/lib/action-payment/contract").ActionPaymentOption[];
};
export type RankedKeywordsOutcome =
  | ({ ok: true } & (RankedKeywordsSuccess | RankedKeywordsEstimate))
  | {
      budgetReason?: BudgetDenialReason;
      estimatedCostCents?: number;
      ok: false;
      provider?: string;
      payment?: ActionPaymentReceipt;
      reason:
        | "wallet_budget_exhausted"
        | "insufficient_credits"
        | "own_credentials_required"
        | "budget_exhausted"
        | "cost_limit_exceeded"
        | "needs_reauth"
        | "no_domain"
        | "no_source"
        | "rate_limited"
        | "unsupported_location"
        | "provider_error"
        | import("@/lib/action-payment/contract").ActionPaymentFailure;
      resetAt?: number;
    };
class RankedKeywordsOutcomeSignal extends Error {
  constructor(readonly outcome: Exclude<RankedKeywordsOutcome, { ok: true }>) {
    super(outcome.reason);
  }
}

function success(
  entry: RankedKeywordsCacheEntry,
  cached: boolean,
  offset: number,
  connections: RankedKeywordConnection[],
  texts: string[],
): { ok: true } & RankedKeywordsSuccess {
  return {
    cached,
    connections,
    costCents: entry.costCents,
    fetchedAt: entry.fetchedAt,
    offset,
    ok: true,
    rows: annotate(entry.rows, texts),
    totalCount: entry.totalCount,
  };
}

export async function fetchRankedKeywords(
  input: {
    actorId?: string | null;
    connectionId?: string;
    fresh?: boolean;
    limit: number;
    maxCostCents?: number;
    offset: number;
    origin: ProviderRequestOrigin;
    projectId: string;
    estimateOnly?: boolean;
  } & ActionPaymentInput,
): Promise<RankedKeywordsOutcome> {
  const project = await projectState(input.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  return withProjectCachePolicy(
    project.lookupCacheTtlSeconds,
    async (): Promise<RankedKeywordsOutcome> => {
      const domain = normalizeDomain(trackedProjectDomain(project.domain) ?? "");
      if (!domain) return { ok: false, reason: "no_domain" };
      const eligible = eligibleConnections(project);
      const requestedConnectionId = input.connectionId
        ? requireApiPublicId(input.connectionId, "conn")
        : undefined;
      const selected = selectActionPaymentCandidate(
        eligible,
        requestedConnectionId,
        input.paymentOptionId,
        "ranked_keywords",
      );
      if (!selected) return { ok: false, reason: "no_source" };
      const connections = eligible.map(({ connection, provider }) => ({
        id: requireApiPublicId(connection.publicId ?? "", "conn"),
        label: provider.label,
        provider: provider.id,
      }));
      const location = await resolvedLocation(project);
      const key = rankedKeywordsCacheKey({
        connectionId: selected.connection.id,
        limit: input.limit,
        locationKey: location.key,
        normalizedDomain: domain,
        offset: input.offset,
        projectId: project.id,
      });
      let payment: Awaited<ReturnType<typeof prepareRankedKeywordPayment>> = null;
      try {
        const cached =
          input.fresh || !providerLookupCacheConfigured()
            ? undefined
            : await readRankedKeywordsCache(key);
        payment = await prepareRankedKeywordPayment(
          input,
          project,
          selected,
          location.key,
          cached ?? undefined,
        );
        if (input.estimateOnly)
          return {
            ok: true,
            estimate: true,
            cached: Boolean(cached),
            costCents: 0,
            fetchedAt: cached?.fetchedAt ?? new Date().toISOString(),
            offset: input.offset,
            rows: [],
            totalCount: cached?.totalCount ?? null,
            connections,
            ...(payment
              ? {
                  payment: payment.quote,
                  paymentOptions: enumerateActionPaymentOptions(eligible, "ranked_keywords"),
                }
              : {}),
          };
        const lookup = await withRankedKeywordsCache({
          fresh: input.fresh,
          key,
          load: async () => {
            payment = await prepareRankedKeywordPayment(
              input,
              project,
              selected,
              location.key,
              undefined,
            );
            const rateContext =
              selected.provider.id === "dataforseo"
                ? LIST_PROVIDER_RATE_CONTEXT
                : await loadProviderRateContext(selected.connection.id, "ranked_keywords");
            const estimatedCostCents = await requiredConnectionEstimate({
              connection: selected.connection,
              feature: "ranked_keywords",
              context: rateContext,
              itemCount: input.limit,
              providerId: selected.provider.id,
              rate: rankedKeywordPageRate(selected.provider.id),
            });
            const cap = input.maxCostCents;
            if (cap === 0 || (cap !== undefined && estimatedCostCents > cap)) {
              throw new RankedKeywordsOutcomeSignal({
                estimatedCostCents,
                ok: false,
                reason: "cost_limit_exceeded",
              });
            }
            const page = await paidProviderCall({
              payment: payment?.child("ranked-page"),
              call: (credentials, usage) =>
                selected.provider.fetchRankedKeywords(credentials, {
                  domain,
                  limit: input.limit,
                  location: location.value,
                  offset: input.offset,
                  attribution: usage,
                  tag: usage?.tag,
                }),
              connection: selected.connection,
              credential: input.origin.credential,
              feature: "ranked_keywords",
              itemCount: input.limit,
              projectId: project.id,
              maxCostCents: input.maxCostCents,
              provider: selected.provider,
              rate: rankedKeywordPageRate(selected.provider.id),
              rateContext,
              source: input.origin.source,
              trigger: "manual",
            });
            const entry = {
              ...page,
              fetchedAt: new Date().toISOString(),
              ...(payment ? { payment: payment.receipt() } : {}),
            };
            return entry;
          },
        });
        if (lookup.status === "contended") {
          return { ok: false, reason: "rate_limited", resetAt: lookup.resetAt };
        }
        return {
          ...success(
            lookup.value,
            lookup.cached,
            input.offset,
            connections,
            project.keywords.map((row) => row.text),
          ),
          ...(input.maxCostCents === 0 && lookup.cached ? { costCents: 0 } : {}),
          ...(payment ? { payment: payment.receipt() } : {}),
          ...(lookup.cached && payment ? { freeUntil: payment.quote.cache.freeUntil } : {}),
          ...(lookup.cached && lookup.value.payment
            ? { originalPayment: lookup.value.payment }
            : {}),
        };
      } catch (error) {
        const failure = paymentFailure(error);
        if (failure)
          return { ...failure, ...(payment?.hasAttempted ? { payment: payment.receipt() } : {}) };
        const admission = payment?.hasAttempted
          ? paymentAdmissionFailure(error, payment.receipt())
          : null;
        if (admission) return admission;
        if (error instanceof ProviderLookupSignal) {
          if (error.outcome.reason === "cost_limit_exceeded")
            return { ...error.outcome, reason: "cost_limit_exceeded" };
          if (
            error.outcome.reason === "budget_exhausted" ||
            error.outcome.reason === "needs_reauth" ||
            error.outcome.reason === "rate_limited" ||
            error.outcome.reason === "unsupported_location"
          ) {
            return {
              ok: false,
              reason: error.outcome.reason,
              ...(error.outcome.reason === "budget_exhausted"
                ? { budgetReason: error.outcome.budgetReason }
                : {}),
              ...(error.outcome.reason === "budget_exhausted" &&
              error.outcome.provider !== undefined
                ? { provider: error.outcome.provider }
                : {}),
              ...(error.outcome.resetAt === undefined ? {} : { resetAt: error.outcome.resetAt }),
            };
          }
        }
        if (error instanceof RankedKeywordsOutcomeSignal) return error.outcome;
        if (payment?.hasAttempted)
          return { ok: false, reason: "provider_error", payment: payment.receipt() };
        throw error;
      }
    },
  ).catch((error: unknown) => {
    const failure = paymentFailure(error);
    if (failure) return failure;
    throw error;
  });
}
