import "server-only";

import { fetchRankedKeywords } from "@/lib/ranked-keywords/service";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject } from "./surface";

const booleanParam = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default(false);
const querySchema = z.object({
  connectionId: z.string().trim().min(1).max(120).optional(),
  fresh: booleanParam,
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).max(900).multipleOf(100).default(0),
});

function query(ctx: ApiContext) {
  const input = querySchema.parse({
    connectionId: ctx.url.searchParams.get("connection_id") ?? undefined,
    fresh: ctx.url.searchParams.get("fresh") ?? undefined,
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    offset: ctx.url.searchParams.get("offset") ?? undefined,
  });
  return {
    ...input,
    connectionId: input.connectionId ? requireApiPublicId(input.connectionId, "conn") : undefined,
  };
}

function connectionsResource(connections: Array<{ id: string; label: string; provider: string }>) {
  return connections.map((connection) => ({
    ...connection,
    id: requireApiPublicId(connection.id, "conn"),
  }));
}

function error(ctx: ApiContext, reason: string, resetAt?: number) {
  if (reason === "no_source") {
    return errorResponse("not_found", "No eligible ranked-keyword source is connected.", 404, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (reason === "no_domain") {
    return errorResponse("bad_request", "The project needs a valid domain.", 422, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (reason === "budget_exhausted") {
    return errorResponse("budget_exhausted", "Rank check monthly budget reached.", 429, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (reason === "rate_limited") {
    const headers = new Headers(ctx.headers);
    const retryAfter = String(
      Math.max(1, Math.ceil(((resetAt ?? Date.now() + 1_000) - Date.now()) / 1_000)),
    );
    headers.set("Retry-After", retryAfter);
    headers.set("RateLimit-Reset", retryAfter);
    return errorResponse("rate_limited", "Provider rate limit reached. Try again shortly.", 429, {
      headers,
      instance: ctx.instance,
    });
  }
  if (reason === "unsupported_location") {
    return errorResponse(
      "unsupported_location",
      "Ranked-keyword lookup is not available for this location on DataForSEO.",
      422,
      { headers: ctx.headers, instance: ctx.instance },
    );
  }
  return errorResponse("provider_unavailable", "Provider authorization must be renewed.", 422, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}

export async function listRankedKeywordSuggestions(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = query(ctx);
  const result = await fetchRankedKeywords({
    actorId: ctx.actorId,
    ...input,
    projectId: ctx.auth.project.id,
  });
  if (!result.ok) return error(ctx, result.reason, result.resetAt);
  return resourceResponse(
    {
      cached: result.cached,
      connections: connectionsResource(result.connections),
      cost_cents: result.costCents,
      fetched_at: result.fetchedAt,
      offset: result.offset,
      rows: result.rows.map((row) => ({
        already_tracked: row.alreadyTracked,
        estimated_traffic: row.estimatedTraffic,
        keyword: row.keyword,
        position: row.position,
        search_volume: row.searchVolume,
      })),
      total_count: result.totalCount,
    },
    { headers: ctx.headers },
  );
}
