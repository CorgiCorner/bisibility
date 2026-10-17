import "server-only";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import { withProjectCachePolicy } from "@/lib/provider-lookups/project-cache-policy";
import { backlinksCacheKey, backlinksCacheTtlSeconds, withBacklinksCache } from "./cache";
import { backlinksProject, backlinksSource } from "./context";
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
import type {
  AnalyzeBacklinksOptions,
  BacklinksEstimate,
  BacklinksOutcome,
  BacklinksServiceContext,
} from "./types";

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

function estimateEnvelope(input: {
  cachedSnapshot: { expiresAt: Date; fetchedAt: Date } | null;
  estimatedCostCents: number;
  includeSubdomains: boolean;
  provider: string;
  scope: "page" | "site";
  target: string;
}): BacklinksEstimate {
  return {
    cached: input.cachedSnapshot !== null,
    cachedUntil: input.cachedSnapshot
      ? new Date(
          Math.min(
            input.cachedSnapshot.expiresAt.getTime(),
            input.cachedSnapshot.fetchedAt.getTime() + backlinksCacheTtlSeconds() * 1000,
          ),
        ).toISOString()
      : null,
    costCents: input.cachedSnapshot ? 0 : input.estimatedCostCents,
    estimate: true,
    estimatedCostCents: input.estimatedCostCents,
    includeSubdomains: input.includeSubdomains,
    ok: true,
    provider: input.provider,
    target: input.target,
    targetScope: input.scope,
  };
}

export async function analyzeBacklinks(
  context: BacklinksServiceContext,
  options: AnalyzeBacklinksOptions,
): Promise<BacklinksOutcome> {
  const input = normalizedInput(options);
  const now = new Date();
  const project = await backlinksProject(context.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  return withProjectCachePolicy(
    project.lookupCacheTtlSeconds,
    async (): Promise<BacklinksOutcome> => {
      if (options.provider === "unknown") {
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
          ? estimateEnvelope({
              cachedSnapshot: cached,
              estimatedCostCents: 0,
              includeSubdomains: input.includeSubdomains,
              provider: "unknown",
              scope: input.scope,
              target: input.target,
            })
          : snapshotEnvelope(cached, { cached: true, costCents: 0, now });
      }
      const source = backlinksSource(project, options.provider);
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
            return snapshotEnvelope(cached, { cached: true, costCents: 0, now });
          }
        }
      }

      if (!source) return { ok: false, reason: "no_source" };
      const estimate = backlinksEstimate({
        resultLimit: input.resultLimit,
        scope: input.scope,
        source,
      });
      if (options.estimateOnly) {
        return estimateEnvelope({
          cachedSnapshot,
          estimatedCostCents: estimate.total,
          includeSubdomains: input.includeSubdomains,
          provider: source.provider.id,
          scope: input.scope,
          target: input.target,
        });
      }

      try {
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
            const result = await fetchBacklinksAnalysis({
              ...input,
              maxCostCents: options.maxCostCents,
              origin: context.origin,
              projectId: project.id,
              source,
            });
            const fetchedAt = new Date();
            const persisted = await persistBacklinksSnapshot({
              ...input,
              ...result,
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
        return lookup.cached ? { ...lookup.value, cached: true, costCents: 0 } : lookup.value;
      } catch (error) {
        if (error instanceof BacklinksHistoryEvidenceError) {
          return {
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
        return lookupFailure(error) ?? Promise.reject(error);
      }
    },
  );
}
