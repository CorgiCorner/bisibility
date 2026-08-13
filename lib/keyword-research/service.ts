import "server-only";

import { requireApiPublicId } from "@/lib/api/public-id";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import type { ResearchPage } from "@/lib/providers/types";
import type { SerpRankLocation } from "@/lib/serp/location";
import {
  keywordResearchCachedUntil,
  keywordResearchCacheKey,
  readKeywordResearchCache,
  withKeywordResearchCache,
} from "./cache";
import {
  eligibleResearchConnections,
  keywordResearchProject,
  normalizeResearchKeyword,
  researchLocation,
} from "./context";
import { annotateResearchResult } from "./result-annotation";

export { fetchKeywordMetrics } from "./metrics";

import { loadProviderRateContext } from "@/lib/provider-rates/connection-context";
import {
  callResearchSource,
  type ResearchSelection,
  sourceEstimate,
  sourcesForMode,
} from "./source-call";
import type {
  KeywordResearchMode,
  KeywordResearchOutcome,
  KeywordResearchSource,
  KeywordResearchSourceDiagnostic,
  KeywordResearchSourceReason,
} from "./types";

function sourceKey(input: {
  connectionId: string;
  includeClickstream: boolean;
  limit: number;
  location: SerpRankLocation;
  projectId: string;
  seed: string;
  source: KeywordResearchSource;
}) {
  return keywordResearchCacheKey({
    connectionId: input.connectionId,
    includeClickstream: input.includeClickstream,
    location: input.location,
    normalizedSeed: normalizeResearchKeyword(input.seed),
    projectId: input.projectId,
    resultLimit: input.limit,
    source: input.source,
  });
}

function remainingDiagnostics(
  sources: KeywordResearchSource[],
  from: number,
  reason: KeywordResearchSourceReason,
): KeywordResearchSourceDiagnostic[] {
  return sources.slice(from).map((source) => ({
    cached: false,
    costCents: 0,
    reason,
    returned: 0,
    source,
    status: "skipped",
  }));
}

async function estimateResearch(input: {
  context: Awaited<ReturnType<typeof loadProviderRateContext>>;
  fresh?: boolean;
  includeClickstream: boolean;
  limit: number;
  location: SerpRankLocation;
  mode: KeywordResearchMode;
  projectId: string;
  seed: string;
  selected: ResearchSelection;
}): Promise<{ cached: boolean; costCents: number; sources: KeywordResearchSourceDiagnostic[] }> {
  const sources = sourcesForMode(input.mode);
  const diagnostics = await Promise.all(
    sources.map(async (source) => {
      const cachedEntry = input.fresh
        ? null
        : await readKeywordResearchCache(
            sourceKey({
              connectionId: input.selected.connection.id,
              includeClickstream: input.includeClickstream,
              limit: input.limit,
              location: input.location,
              projectId: input.projectId,
              seed: input.seed,
              source,
            }),
          );
      const cached = Boolean(cachedEntry);
      return {
        cached,
        costCents: cached ? 0 : sourceEstimate({ ...input, source }),
        returned: 0,
        source,
        status: "ok" as const,
      };
    }),
  );
  return {
    cached: diagnostics.every((source) => source.cached),
    costCents: diagnostics.reduce((sum, source) => sum + source.costCents, 0),
    sources: diagnostics,
  };
}

export async function researchKeywords(input: {
  actorId?: string | null;
  connectionId?: string;
  estimateOnly?: boolean;
  fresh?: boolean;
  includeClickstream: boolean;
  locationKey?: string;
  maxCostCents?: number;
  mode: KeywordResearchMode;
  projectId: string;
  resultLimit: number;
  seed: string;
}): Promise<KeywordResearchOutcome> {
  const project = await keywordResearchProject(input.projectId);
  if (!project) return { ok: false, reason: "no_source" };
  const eligible = eligibleResearchConnections(project, "research");
  const requestedConnectionId = input.connectionId
    ? requireApiPublicId(input.connectionId, "conn")
    : undefined;
  const selected = requestedConnectionId
    ? eligible.find(({ connection }) => connection.publicId === requestedConnectionId)
    : eligible[0];
  if (!selected) return { ok: false, reason: "no_source" };
  const rateContext = await loadProviderRateContext(selected.connection.id, "keyword_research");
  const location = await researchLocation(project, input.locationKey);
  const fetchedAt = new Date().toISOString();
  if (input.estimateOnly) {
    const estimate = await estimateResearch({
      ...input,
      context: rateContext,
      limit: input.resultLimit,
      location: location.value,
      selected,
    });
    return annotateResearchResult(
      {
        ...estimate,
        cachedUntil: keywordResearchCachedUntil(fetchedAt),
        estimate: true,
        fetchedAt,
        rows: [],
      },
      project,
      selected,
      eligible,
      location.key,
    );
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
      diagnostics.push(...remainingDiagnostics(plannedSources, index, "result_limit"));
      break;
    }
    const key = sourceKey({
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
          const estimated = sourceEstimate({
            context: rateContext,
            includeClickstream: input.includeClickstream,
            limit: input.resultLimit,
            selected,
            source,
          });
          if (
            input.maxCostCents !== undefined &&
            spentThisRequest + estimated > input.maxCostCents
          ) {
            throw new ProviderLookupSignal({ ok: false, reason: "cost_limit_exceeded" });
          }
          const page = await callResearchSource({
            ...input,
            budgetCapCents: project.budgetCapCents,
            limit: input.resultLimit,
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
        costCents: lookup.value.costCents,
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
      const outcome = error instanceof ProviderLookupSignal ? error.outcome : null;
      const isCostLimit = outcome?.reason === "cost_limit_exceeded";
      if (
        !diagnostics.some((item) => item.status === "ok") &&
        !(input.mode === "auto" && isCostLimit)
      )
        if (outcome) return outcome;
        else throw error;
      const reason: KeywordResearchSourceReason = isCostLimit
        ? "cost_limit"
        : outcome && outcome.reason !== "cost_limit_exceeded"
          ? outcome.reason
          : "provider_error";
      diagnostics.push({
        cached: false,
        costCents: 0,
        reason,
        returned: 0,
        source,
        status: isCostLimit ? "skipped" : "failed",
      });
      diagnostics.push(
        ...remainingDiagnostics(
          plannedSources,
          index + 1,
          isCostLimit ? "cost_limit" : "previous_source_failed",
        ),
      );
      break;
    }
  }
  return annotateResearchResult(
    {
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
    selected,
    eligible,
    location.key,
  );
}
