import "server-only";

import {
  analyzeBacklinks,
  BacklinksSnapshotExpiredError,
  loadMoreBacklinkRows,
} from "@/lib/backlinks/service";
import { UnsupportedBacklinksTargetError } from "@/lib/backlinks/target";
import type { BacklinksOutcome, BacklinksSnapshot } from "@/lib/backlinks/types";
import type { ProviderLookupFailure } from "@/lib/provider-lookups/paid-call";
import { z } from "zod";
import type { ApiContext } from "./context";
import { dataResponse, errorResponse } from "./responses";
import { readJsonBody, scopedProject, snakeizeKeys } from "./surface";

const falseParam = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");
const trueParam = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");
const resultLimitSchema = z.coerce
  .number()
  .pipe(z.union([z.literal(100), z.literal(300), z.literal(500), z.literal(1000)]));

const analyzeQuerySchema = z.object({
  estimate_only: falseParam,
  fresh: falseParam,
  include_subdomains: trueParam,
  max_cost_cents: z.coerce.number().int().positive().optional(),
  mode: z.enum(["as_is", "one_per_domain"]).default("as_is"),
  result_limit: resultLimitSchema.default(100),
  target: z.string().trim().min(1),
  target_scope: z.enum(["site", "page"]).default("site"),
});

const rowsBodySchema = z.object({
  include_subdomains: z.boolean(),
  limit: z.number().int().min(100).max(1000).multipleOf(100),
  target: z.string().trim().min(1),
  target_scope: z.enum(["site", "page"]),
});

function analyzeQuery(ctx: ApiContext) {
  return analyzeQuerySchema.parse({
    estimate_only: ctx.url.searchParams.get("estimate_only") ?? undefined,
    fresh: ctx.url.searchParams.get("fresh") ?? undefined,
    include_subdomains: ctx.url.searchParams.get("include_subdomains") ?? undefined,
    max_cost_cents: ctx.url.searchParams.get("max_cost_cents") ?? undefined,
    mode: ctx.url.searchParams.get("mode") ?? undefined,
    result_limit: ctx.url.searchParams.get("result_limit") ?? undefined,
    target: ctx.url.searchParams.get("target") ?? undefined,
    target_scope: ctx.url.searchParams.get("target_scope") ?? undefined,
  });
}

function retryHeaders(ctx: ApiContext, resetAt: number | undefined, fallbackMs: number) {
  const headers = new Headers(ctx.headers);
  const retryAfter = String(
    Math.max(1, Math.ceil(((resetAt ?? Date.now() + fallbackMs) - Date.now()) / 1_000)),
  );
  headers.set("Retry-After", retryAfter);
  headers.set("RateLimit-Reset", retryAfter);
  return headers;
}

function lookupError(ctx: ApiContext, outcome: ProviderLookupFailure) {
  const common = { headers: ctx.headers, instance: ctx.instance };
  if (outcome.reason === "no_source") {
    return errorResponse("not_found", "No eligible backlinks source is connected.", 404, common);
  }
  if (outcome.reason === "budget_exhausted") {
    return errorResponse("budget_exhausted", "Monthly provider budget reached.", 429, common);
  }
  if (outcome.reason === "cost_limit_exceeded") {
    return errorResponse(
      "cost_limit_exceeded",
      "The estimated provider cost exceeds max_cost_cents.",
      422,
      common,
    );
  }
  if (outcome.reason === "in_progress") {
    return errorResponse(
      "lookup_in_progress",
      "An identical cached lookup is still in progress. Try again after the cache lock expires.",
      429,
      {
        headers: retryHeaders(ctx, outcome.resetAt, 5_000),
        instance: ctx.instance,
      },
    );
  }
  if (outcome.reason === "rate_limited") {
    return errorResponse("rate_limited", "Provider rate limit reached. Try again shortly.", 429, {
      headers: retryHeaders(ctx, outcome.resetAt, 1_000),
      instance: ctx.instance,
    });
  }
  return errorResponse(
    "provider_unavailable",
    outcome.reason === "needs_reauth"
      ? "Provider authorization must be renewed."
      : "The backlinks provider rejected this request.",
    422,
    common,
  );
}

function successResponse(ctx: ApiContext, snapshot: BacklinksSnapshot) {
  const { ok: _ok, ...data } = snapshot;
  return dataResponse(snakeizeKeys(data), { headers: ctx.headers });
}

function outcomeResponse(ctx: ApiContext, outcome: BacklinksOutcome) {
  return outcome.ok ? successResponse(ctx, outcome) : lookupError(ctx, outcome);
}

function typedErrorResponse(ctx: ApiContext, error: unknown) {
  if (error instanceof UnsupportedBacklinksTargetError) {
    return errorResponse("unsupported_target", error.message, 422, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  if (error instanceof BacklinksSnapshotExpiredError) {
    return errorResponse("snapshot_expired", error.message, 409, {
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  throw error;
}

export async function getBacklinks(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = analyzeQuery(ctx);
  try {
    const outcome = await analyzeBacklinks(
      { actorId: ctx.actorId, projectId: ctx.auth.project.id },
      {
        estimateOnly: input.estimate_only,
        fresh: input.fresh,
        includeSubdomains: input.include_subdomains,
        maxCostCents: input.max_cost_cents,
        mode: input.mode,
        resultLimit: input.result_limit,
        target: input.target,
        targetScope: input.target_scope,
      },
    );
    return outcomeResponse(ctx, outcome);
  } catch (error) {
    return typedErrorResponse(ctx, error);
  }
}

export async function postBacklinkRows(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = rowsBodySchema.parse(await readJsonBody(ctx));
  try {
    const outcome = await loadMoreBacklinkRows(
      { actorId: ctx.actorId, projectId: ctx.auth.project.id },
      {
        includeSubdomains: input.include_subdomains,
        limit: input.limit,
        target: input.target,
        targetScope: input.target_scope,
      },
    );
    return outcomeResponse(ctx, outcome);
  } catch (error) {
    return typedErrorResponse(ctx, error);
  }
}
