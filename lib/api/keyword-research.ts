import "server-only";

import { fetchKeywordMetrics, researchKeywords } from "@/lib/keyword-research/service";
import type { ProviderLookupFailure } from "@/lib/keyword-research/types";
import type { KeywordMetrics } from "@/lib/providers/types";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject } from "./surface";

const booleanParam = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default(false);
const researchQuerySchema = z.object({
  connectionId: z.string().trim().min(1).max(120).optional(),
  estimateOnly: booleanParam,
  fresh: booleanParam,
  includeClickstream: booleanParam,
  mode: z.enum(["auto", "related", "suggestions", "ideas"]).default("auto"),
  maxCostCents: z.coerce.number().int().positive().optional(),
  resultLimit: z.coerce.number().pipe(z.union([z.literal(100), z.literal(300), z.literal(500)])),
  seed: z.string().trim().min(1).max(80),
});
const metricsBodySchema = z.object({
  connection_id: z.string().trim().min(1).max(120).optional(),
  estimate_only: z.boolean().default(false),
  fresh: z.boolean().default(false),
  include_clickstream: z.boolean().default(false),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(700),
  max_cost_cents: z.number().int().positive().optional(),
});

function query(ctx: ApiContext) {
  const input = researchQuerySchema.parse({
    connectionId: ctx.url.searchParams.get("connection_id") ?? undefined,
    estimateOnly: ctx.url.searchParams.get("estimate_only") ?? undefined,
    fresh: ctx.url.searchParams.get("fresh") ?? undefined,
    includeClickstream: ctx.url.searchParams.get("include_clickstream") ?? undefined,
    mode: ctx.url.searchParams.get("mode") ?? undefined,
    maxCostCents: ctx.url.searchParams.get("max_cost_cents") ?? undefined,
    resultLimit: ctx.url.searchParams.get("result_limit") ?? 100,
    seed: ctx.url.searchParams.get("seed") ?? undefined,
  });
  return {
    ...input,
    connectionId: input.connectionId ? requireApiPublicId(input.connectionId, "conn") : undefined,
  };
}

function connectionResources(connections: Array<{ id: string; label: string; provider: string }>) {
  return connections.map((connection) => ({
    ...connection,
    id: requireApiPublicId(connection.id, "conn"),
  }));
}

function lookupError(ctx: ApiContext, outcome: ProviderLookupFailure) {
  if (outcome.reason === "no_source") {
    return errorResponse("not_found", "No eligible keyword research source is connected.", 404, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (outcome.reason === "budget_exhausted") {
    return errorResponse("budget_exhausted", "Monthly provider budget reached.", 429, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (outcome.reason === "cost_limit_exceeded") {
    return errorResponse(
      "cost_limit_exceeded",
      "The estimated provider cost exceeds max_cost_cents.",
      422,
      { headers: ctx.headers, instance: ctx.instance },
    );
  }
  if (outcome.reason === "in_progress") {
    const headers = new Headers(ctx.headers);
    const retryAfter = String(
      Math.max(1, Math.ceil(((outcome.resetAt ?? Date.now() + 5_000) - Date.now()) / 1_000)),
    );
    headers.set("Retry-After", retryAfter);
    headers.set("RateLimit-Reset", retryAfter);
    return errorResponse(
      "lookup_in_progress",
      "An identical cached lookup is still in progress. Try again after the cache lock expires.",
      429,
      { headers, instance: ctx.instance },
    );
  }
  if (outcome.reason === "rate_limited") {
    const headers = new Headers(ctx.headers);
    const retryAfter = String(
      Math.max(1, Math.ceil(((outcome.resetAt ?? Date.now() + 1_000) - Date.now()) / 1_000)),
    );
    headers.set("Retry-After", retryAfter);
    headers.set("RateLimit-Reset", retryAfter);
    return errorResponse("rate_limited", "Provider rate limit reached. Try again shortly.", 429, {
      headers,
      instance: ctx.instance,
    });
  }
  if (outcome.reason === "unsupported_location") {
    return errorResponse(
      "unsupported_location",
      "Keyword research is not available for this location on DataForSEO.",
      422,
      { headers: ctx.headers, instance: ctx.instance },
    );
  }
  return errorResponse("provider_unavailable", "Provider authorization must be renewed.", 422, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}

function metricsResource(metrics: KeywordMetrics) {
  return {
    competition: metrics.competition,
    cpc_cents: metrics.cpcCents,
    difficulty: metrics.difficulty,
    intent: metrics.intent,
    monthly_trend: metrics.monthlyTrend.map((row) => ({
      month: row.month,
      search_volume: row.searchVolume,
      year: row.year,
    })),
    search_volume: metrics.searchVolume,
  };
}

export async function getKeywordResearch(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = query(ctx);
  const result = await researchKeywords({
    actorId: ctx.actorId,
    ...input,
    projectId: ctx.auth.project.id,
  });
  if (!result.ok) return lookupError(ctx, result);
  return resourceResponse(
    {
      cached: result.cached,
      connections: connectionResources(result.connections),
      cost_cents: result.costCents,
      ...(result.estimate === undefined ? {} : { estimate: result.estimate }),
      fetched_at: result.fetchedAt,
      provider: result.provider,
      rows: result.rows.map((row) => ({
        ...metricsResource(row),
        already_tracked: row.alreadyTracked,
        keyword: row.keyword,
        source: row.source,
      })),
      sources: result.sources.map((source) => ({
        cached: source.cached,
        cost_cents: source.costCents,
        ...(source.reason === undefined ? {} : { reason: source.reason }),
        returned: source.returned,
        source: source.source,
        status: source.status,
      })),
      total_count: result.rows.length,
    },
    { headers: ctx.headers },
  );
}

export async function postKeywordMetrics(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = metricsBodySchema.parse(await ctx.req.json());
  const connectionId = input.connection_id
    ? requireApiPublicId(input.connection_id, "conn")
    : undefined;
  const result = await fetchKeywordMetrics({
    actorId: ctx.actorId,
    connectionId,
    estimateOnly: input.estimate_only,
    fresh: input.fresh,
    includeClickstream: input.include_clickstream,
    keywords: input.keywords,
    maxCostCents: input.max_cost_cents,
    projectId: ctx.auth.project.id,
  });
  if (!result.ok) return lookupError(ctx, result);
  return resourceResponse(
    {
      cached_count: result.cachedCount,
      connections: connectionResources(result.connections),
      cost_cents: result.costCents,
      ...(result.estimate === undefined ? {} : { estimate: result.estimate }),
      ...(result.estimatedCostCents === undefined
        ? {}
        : { estimated_cost_cents: result.estimatedCostCents }),
      fetched_at: result.fetchedAt,
      fetched_count: result.fetchedCount,
      ...(result.fetchedCountEstimate === undefined
        ? {}
        : { fetched_count_estimate: result.fetchedCountEstimate }),
      provider: result.provider,
      rows: result.rows.map((row) => ({
        ...metricsResource(row),
        keyword: row.keyword,
      })),
      total_count: result.rows.length,
    },
    { headers: ctx.headers },
  );
}
