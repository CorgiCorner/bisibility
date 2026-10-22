import "server-only";
import { paymentAdmissionFailure } from "@/lib/action-payment/admission-failure";
import {
  enumerateActionPaymentOptions,
  selectActionPaymentCandidate,
} from "@/lib/action-payment/options";
import { type ActionPaymentInput, paymentFailure } from "@/lib/action-payment/session";
import { requireApiPublicId } from "@/lib/api/public-id";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { remainingRequestCostLimit } from "@/lib/provider-usage/request-cost-limit";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { ResearchPage } from "@/lib/providers/types";
import { supportsResearchScope } from "@/lib/serp/research-capability";
import { keywordResearchCachedUntil, withKeywordResearchCache } from "./cache";
import {
  connectionResources,
  eligibleResearchConnections,
  keywordResearchProject,
  researchLocation,
} from "./context";
import {
  estimateKeywordResearch,
  keywordResearchSourceKey,
  remainingResearchDiagnostics,
} from "./execution";
import { prepareResearchPayment } from "./payment";
import { normalizeResearchKeyword } from "./request-key";
import { annotateResearchResult } from "./result-annotation";
import { maybePersistKeywordResearchSnapshot } from "./snapshot";

export { fetchKeywordMetrics } from "./metrics";

import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { callResearchSource, sourceEstimate, sourcesForMode } from "./source-call";
import type {
  KeywordResearchMode,
  KeywordResearchOutcome,
  KeywordResearchSource,
  KeywordResearchSourceDiagnostic,
  KeywordResearchSourceReason,
} from "./types";

export async function researchKeywords(
  input: ActionPaymentInput & {
    actorId?: string | null;
    connectionId?: string;
    estimateOnly?: boolean;
    fresh?: boolean;
    includeClickstream: boolean;
    locationKey?: string;
    maxCostCents?: number;
    mode: KeywordResearchMode;
    origin: ProviderRequestOrigin;
    projectId: string;
    resultLimit: number;
    seed: string;
  },
): Promise<KeywordResearchOutcome> {
  const project = await keywordResearchProject(input.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  return withProjectCachePolicy(
    project.lookupCacheTtlSeconds,
    async (): Promise<KeywordResearchOutcome> => {
      const eligible = eligibleResearchConnections(project, "research", input.mode);
      const requestedConnectionId = input.connectionId
        ? requireApiPublicId(input.connectionId, "conn")
        : undefined;
      const selected = selectActionPaymentCandidate(
        eligible,
        requestedConnectionId,
        input.paymentOptionId,
        "keyword_research",
      );
      if (!selected) return { ok: false, reason: "no_source" };
      const location = await researchLocation(project, input.locationKey);
      if (!supportsResearchScope(location.value.gl, location.value.hl)) {
        return { ok: false, reason: "unsupported_location" };
      }
      const rateContext =
        selected.provider.id === "dataforseo"
          ? LIST_PROVIDER_RATE_CONTEXT
          : await loadProviderRateContext(selected.connection.id, "keyword_research");
      const fetchedAt = new Date().toISOString();
      const payment = await prepareResearchPayment(input, project, selected, {
        ...input,
        context: rateContext,
        limit: input.resultLimit,
        location: location.value,
        projectId: project.id,
      });
      if (input.estimateOnly) {
        const estimate = await estimateKeywordResearch({
          ...input,
          context: rateContext,
          limit: input.resultLimit,
          location: location.value,
          selected,
        });
        return {
          ...(payment
            ? {
                payment: payment.quote,
                paymentOptions: enumerateActionPaymentOptions(eligible, "keyword_research"),
              }
            : {}),
          ...estimate,
          connections: connectionResources(eligible),
          estimate: true,
          ok: true,
          provider: selected.provider.label,
        };
      }

      const plannedSources = sourcesForMode(input.mode);
      const seen = new Set([normalizeResearchKeyword(input.seed)]);
      const rows: Array<ResearchPage["rows"][number] & { source: KeywordResearchSource }> = [];
      const diagnostics: KeywordResearchSourceDiagnostic[] = [];
      const successfulFetchedAts: string[] = [];
      let spentThisRequest = 0;
      let latestFetchedAt = fetchedAt;
      for (let index = 0; index < plannedSources.length; index += 1) {
        const source = plannedSources[index];
        if (rows.length >= input.resultLimit) {
          diagnostics.push(...remainingResearchDiagnostics(plannedSources, index, "result_limit"));
          break;
        }
        const key = keywordResearchSourceKey({
          connectionId: selected.connection.id,
          includeClickstream: input.includeClickstream,
          limit: input.resultLimit,
          location: location.value,
          projectId: project.id,
          seed: input.seed,
          source,
        });
        try {
          const lookup = await withKeywordResearchCache({
            fresh: input.fresh,
            key,
            load: async () => {
              const estimated = await sourceEstimate({
                context: rateContext,
                includeClickstream: input.includeClickstream,
                limit: input.resultLimit,
                selected,
                source,
              });
              if (
                input.maxCostCents === 0 ||
                (input.maxCostCents !== undefined &&
                  spentThisRequest + estimated > input.maxCostCents)
              ) {
                throw new ProviderLookupSignal({
                  estimatedCostCents: spentThisRequest + estimated,
                  ok: false,
                  reason: "cost_limit_exceeded",
                });
              }
              const page = await callResearchSource({
                payment: payment?.child(source),
                ...input,
                limit: input.resultLimit,
                maxCostCents: remainingRequestCostLimit(input.maxCostCents, spentThisRequest),
                location: location.value,
                projectId: project.id,
                rateContext,
                selected,
                source,
              });
              spentThisRequest += page.costCents;
              return { ...page, fetchedAt: new Date().toISOString() };
            },
          });
          if (lookup.status === "contended") {
            throw new ProviderLookupSignal({
              ok: false,
              reason: "in_progress",
              resetAt: lookup.resetAt,
            });
          }
          latestFetchedAt = lookup.value.fetchedAt;
          successfulFetchedAts.push(lookup.value.fetchedAt);
          diagnostics.push({
            cached: lookup.cached,
            costCents: input.maxCostCents === 0 && lookup.cached ? 0 : lookup.value.costCents,
            returned: lookup.value.rows.length,
            source,
            status: "ok",
          });
          for (const row of lookup.value.rows) {
            const normalized = normalizeResearchKeyword(row.keyword);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            rows.push({ ...row, source });
            if (rows.length >= input.resultLimit) break;
          }
        } catch (error) {
          const failure = paymentFailure(error);
          if (failure)
            return { ...failure, ...(payment?.hasAttempted ? { payment: payment.receipt() } : {}) };
          if (error instanceof DeploymentAdmissionExhaustedError) {
            const denial = payment?.hasAttempted
              ? paymentAdmissionFailure(
                  error,
                  payment.receipt(),
                  diagnostics.reduce((sum, item) => sum + (item.cached ? 0 : item.costCents), 0),
                )
              : null;
            if (denial) return denial;
            throw error;
          }
          const outcome = error instanceof ProviderLookupSignal ? error.outcome : null;
          const isCostLimit = outcome?.reason === "cost_limit_exceeded";
          if (
            input.maxCostCents === 0 ||
            (!diagnostics.some((item) => item.status === "ok") &&
              !(input.mode === "auto" && isCostLimit))
          )
            if (outcome)
              return {
                ...outcome,
                ...(payment?.hasAttempted ? { payment: payment.receipt() } : {}),
              };
            else if (payment?.hasAttempted)
              return { ok: false, reason: "provider_error", payment: payment.receipt() };
            else throw error;
          const reason: KeywordResearchSourceReason = isCostLimit
            ? "cost_limit"
            : outcome && outcome.reason !== "cost_limit_exceeded"
              ? outcome.reason
              : "provider_error";
          diagnostics.push({
            cached: false,
            costCents: outcome?.costCents ?? 0,
            reason,
            returned: 0,
            source,
            status: isCostLimit ? "skipped" : "failed",
          });
          diagnostics.push(
            ...remainingResearchDiagnostics(
              plannedSources,
              index + 1,
              isCostLimit ? "cost_limit" : "previous_source_failed",
            ),
          );
          break;
        }
      }
      const outcome = annotateResearchResult(
        {
          ...(payment ? { payment: payment.receipt() } : {}),
          cached:
            diagnostics.length > 0 &&
            diagnostics.every((source) => source.status === "ok" && source.cached),
          cachedUntil: diagnostics.every(
            (source) => source.status === "ok" || source.reason === "result_limit",
          )
            ? keywordResearchCachedUntil(
                successfulFetchedAts.length > 0 ? successfulFetchedAts : fetchedAt,
              )
            : fetchedAt,
          costCents: diagnostics.reduce((sum, source) => sum + source.costCents, 0),
          fetchedAt: latestFetchedAt,
          rows,
          sources: diagnostics,
        },
        project,
        selected.provider.label,
        connectionResources(eligible),
        location.key,
      );
      try {
        await maybePersistKeywordResearchSnapshot({
          connectionPublicId: requestedConnectionId,
          includeClickstream: input.includeClickstream,
          location: location.value,
          mode: input.mode,
          outcome,
          project,
          resultLimit: input.resultLimit,
          seed: input.seed,
          successfulFetchedAts,
        });
      } catch (error) {
        console.error("[keyword-research] Failed to persist a demo snapshot.", error);
      }
      return outcome;
    },
  ).catch((error: unknown) => {
    const failure = paymentFailure(error);
    if (failure) return failure;
    throw error;
  });
}
