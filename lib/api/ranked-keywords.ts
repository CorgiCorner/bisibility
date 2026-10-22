import "server-only";

import { READINESS_REASON } from "@/lib/projects/readiness";
import { fetchRankedKeywords } from "@/lib/ranked-keywords/service";
import { z } from "zod";
import {
  paymentAdmissionResponse,
  paymentFailureResponse,
  paymentResource,
} from "./action-payment";
import { budgetExhaustedResponse } from "./budget-exhausted";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { providerOrigin } from "./request-origin";
import { errorResponse, resourceResponse } from "./responses";
import { scopedProject } from "./surface";

const booleanParam = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .default(false);
export const querySchema = z.object({
  estimateOnly: booleanParam.optional(),
  requirePayment: booleanParam.optional(),
  paymentOptionId: z.string().min(1).max(120).optional(),
  paymentQuoteToken: z.string().min(1).max(12000).optional(),
  connectionId: z.string().trim().min(1).max(120).optional(),
  fresh: booleanParam,
  limit: z.coerce.number().int().min(1).max(100).default(100),
  maxCostCents: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().min(0).max(900).multipleOf(100).default(0),
});

function query(ctx: ApiContext) {
  const input = querySchema.parse({
    estimateOnly: ctx.url.searchParams.get("estimate_only") ?? undefined,
    requirePayment: ctx.url.searchParams.get("require_payment") ?? undefined,
    paymentOptionId: ctx.url.searchParams.get("payment_option_id") ?? undefined,
    paymentQuoteToken: ctx.url.searchParams.get("payment_quote_token") ?? undefined,
    connectionId: ctx.url.searchParams.get("connection_id") ?? undefined,
    fresh: ctx.url.searchParams.get("fresh") ?? undefined,
    limit: ctx.url.searchParams.get("limit") ?? undefined,
    maxCostCents: ctx.url.searchParams.get("max_cost_cents") ?? undefined,
    offset: ctx.url.searchParams.get("offset") ?? undefined,
  });
  return {
    ...input,
    acceptedPayment: input.paymentQuoteToken ? { quoteToken: input.paymentQuoteToken } : undefined,
    connectionId: input.connectionId ? requireApiPublicId(input.connectionId, "conn") : undefined,
  };
}

function connectionsResource(connections: Array<{ id: string; label: string; provider: string }>) {
  return connections.map((connection) => ({
    ...connection,
    id: requireApiPublicId(connection.id, "conn"),
  }));
}

type RankedKeywordsFailure = Exclude<
  Awaited<ReturnType<typeof fetchRankedKeywords>>,
  {
    ok: true;
  }
>;

function error(ctx: ApiContext, outcome: RankedKeywordsFailure) {
  return paymentFailureResponse(
    paymentAdmissionResponse(ctx, outcome) ?? errorBase(ctx, outcome),
    outcome,
  );
}
function errorBase(ctx: ApiContext, outcome: RankedKeywordsFailure) {
  const reason = outcome.reason;
  if (reason.startsWith("payment_"))
    return errorResponse("conflict", "Review the current price before starting this lookup.", 409, {
      headers: ctx.headers,
      instance: ctx.instance,
      problemDetails: { reason },
    });
  if (reason === "provider_error")
    return errorResponse(
      "provider_unavailable",
      "The provider request failed. Review its payment status before retrying.",
      502,
      { headers: ctx.headers, instance: ctx.instance },
    );
  if (reason === "no_source") {
    return errorResponse(
      "not_found",
      `No eligible ranked-keyword source is connected. Reason: ${READINESS_REASON.providerNotConnected}.`,
      404,
      {
        headers: ctx.headers,
        instance: ctx.instance,
      },
    );
  }
  if (reason === "no_domain") {
    return errorResponse("bad_request", "The project needs a valid domain.", 422, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (reason === "budget_exhausted") {
    return budgetExhaustedResponse(ctx, {
      reason: outcome.budgetReason,
      surface: "programmatic",
      ...(outcome.provider === undefined ? {} : { provider: outcome.provider }),
    });
  }
  if (reason === "cost_limit_exceeded") {
    return errorResponse(
      "cost_limit_exceeded",
      "The estimated provider cost exceeds max_cost_cents.",
      422,
      {
        headers: ctx.headers,
        instance: ctx.instance,
        ...(outcome.estimatedCostCents === undefined
          ? {}
          : { problemDetails: { estimated_cost_cents: outcome.estimatedCostCents } }),
      },
    );
  }
  if (reason === "rate_limited") {
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
    origin: providerOrigin(ctx.origin),
    projectId: ctx.auth.project.id,
  });
  if (!result.ok) return error(ctx, result);
  return resourceResponse(
    {
      cached: result.cached,
      ...paymentResource(result),
      ...("estimate" in result ? { estimate: true } : {}),
      connections: connectionsResource(result.connections),
      cost_cents: result.costCents,
      fetched_at: result.fetchedAt,
      ...(result.freeUntil ? { free_until: result.freeUntil } : {}),
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
