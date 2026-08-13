import "server-only";

import {
  analyzeDomainOverview,
  loadDomainKeywordsPage,
  loadDomainOverviewHistory,
  loadDomainPagesPage,
} from "@/lib/domain-overview/service";
import {
  normalizeDomainOverviewTarget,
  UnsupportedDomainOverviewTargetError,
} from "@/lib/domain-overview/target";
import type {
  DomainModuleOutcome,
  DomainOverviewLookupFailure,
  DomainOverviewOutcome,
} from "@/lib/domain-overview/types";
import { z } from "zod";
import type { ApiContext } from "./context";
import { dataResponse, errorResponse } from "./responses";
import { readJsonBody, scopedProject, snakeizeKeys } from "./surface";

const commonFields = {
  fresh: z.boolean().default(false),
  language_code: z.string().trim().min(2).max(12),
  location_code: z.number().int().positive(),
  scope_override: z.enum(["root", "subdomain"]).optional(),
  target: z.string().trim().min(1).max(253),
};

const analyzeBodySchema = z
  .object({
    ...commonFields,
    estimate_only: z.boolean().default(false),
    keyword_limit: z.number().int().min(1).max(100).default(100),
    max_cost_cents: z.number().int().nonnegative().optional(),
    page_limit: z.number().int().min(1).max(1_000).default(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!input.estimate_only && input.max_cost_cents === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "max_cost_cents is required unless estimate_only is true",
        path: ["max_cost_cents"],
      });
    }
  });

const historyBodySchema = z
  .object({
    ...commonFields,
    max_cost_cents: z.number().int().nonnegative(),
  })
  .strict();

const pageFields = {
  ...commonFields,
  max_cost_cents: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
};

const keywordPageBodySchema = z
  .object({
    ...pageFields,
    limit: z.number().int().min(1).max(100),
  })
  .strict();

const relevantPageBodySchema = z
  .object({
    ...pageFields,
    limit: z.number().int().min(1).max(1_000),
  })
  .strict();

function retryHeaders(ctx: ApiContext, resetAt: number | undefined, fallbackMs: number) {
  const headers = new Headers(ctx.headers);
  const retryAfter = String(
    Math.max(1, Math.ceil(((resetAt ?? Date.now() + fallbackMs) - Date.now()) / 1_000)),
  );
  headers.set("Retry-After", retryAfter);
  headers.set("RateLimit-Reset", retryAfter);
  return headers;
}

function failureDetails(outcome: DomainOverviewLookupFailure) {
  return {
    cost_cents: outcome.costCents,
    reason: outcome.reason,
    ...(outcome.reason === "in_progress" || outcome.reason === "rate_limited"
      ? { reset_at: outcome.resetAt ?? null }
      : {}),
  };
}

function lookupError(ctx: ApiContext, outcome: DomainOverviewLookupFailure) {
  const common = {
    details: failureDetails(outcome),
    headers: ctx.headers,
    instance: ctx.instance,
  };
  if (outcome.reason === "no_source") {
    return errorResponse(
      "not_found",
      "No eligible Domain Overview source is connected.",
      404,
      common,
    );
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
    return errorResponse("lookup_in_progress", "An identical lookup is still in progress.", 429, {
      ...common,
      headers: retryHeaders(ctx, outcome.resetAt, 5_000),
    });
  }
  if (outcome.reason === "rate_limited") {
    return errorResponse("rate_limited", "Provider rate limit reached. Try again shortly.", 429, {
      ...common,
      headers: retryHeaders(ctx, outcome.resetAt, 1_000),
    });
  }
  if (outcome.reason === "unsupported_location") {
    return errorResponse(
      "unsupported_location",
      "Domain Overview is not supported for this market.",
      422,
      common,
    );
  }
  if (outcome.reason === "snapshot_expired") {
    return errorResponse(
      "snapshot_expired",
      "Analyze the domain before loading this module.",
      409,
      common,
    );
  }
  return errorResponse(
    "provider_unavailable",
    outcome.reason === "needs_reauth"
      ? "Provider authorization must be renewed."
      : "The Domain Overview provider rejected this request.",
    422,
    common,
  );
}

function successResponse<T extends { ok: true }>(ctx: ApiContext, outcome: T) {
  const { ok: _ok, ...data } = outcome;
  return dataResponse(snakeizeKeys(data), { headers: ctx.headers });
}

function outcomeResponse(ctx: ApiContext, outcome: DomainOverviewOutcome) {
  return outcome.ok ? successResponse(ctx, outcome) : lookupError(ctx, outcome);
}

function moduleResponse<T>(ctx: ApiContext, outcome: DomainModuleOutcome<T>) {
  return outcome.ok ? successResponse(ctx, outcome) : lookupError(ctx, outcome);
}

function typedErrorResponse(ctx: ApiContext, error: unknown) {
  if (error instanceof UnsupportedDomainOverviewTargetError) {
    return errorResponse("unsupported_target", error.message, 422, {
      details: { cost_cents: 0, reason: "unsupported_target" },
      headers: ctx.headers,
      instance: ctx.instance,
    });
  }
  throw error;
}

function serviceContext(ctx: ApiContext) {
  return { actorId: ctx.actorId, projectId: ctx.auth.project.id };
}

function invalidTargetResponse(
  ctx: ApiContext,
  target: string,
  scopeOverride: "root" | "subdomain" | undefined,
) {
  try {
    normalizeDomainOverviewTarget(target, scopeOverride);
    return null;
  } catch (error) {
    return typedErrorResponse(ctx, error);
  }
}

export async function postDomainOverviewAnalyze(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = analyzeBodySchema.parse(await readJsonBody(ctx));
  const invalidTarget = invalidTargetResponse(ctx, input.target, input.scope_override);
  if (invalidTarget) return invalidTarget;
  try {
    return outcomeResponse(
      ctx,
      await analyzeDomainOverview(serviceContext(ctx), {
        estimateOnly: input.estimate_only,
        fresh: input.fresh,
        keywordLimit: input.keyword_limit,
        languageCode: input.language_code,
        locationCode: input.location_code,
        maxCostCents: input.max_cost_cents,
        pageLimit: input.page_limit,
        scopeOverride: input.scope_override,
        target: input.target,
      }),
    );
  } catch (error) {
    return typedErrorResponse(ctx, error);
  }
}

export async function postDomainOverviewHistory(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const input = historyBodySchema.parse(await readJsonBody(ctx));
  const invalidTarget = invalidTargetResponse(ctx, input.target, input.scope_override);
  if (invalidTarget) return invalidTarget;
  return moduleResponse(
    ctx,
    await loadDomainOverviewHistory(serviceContext(ctx), {
      fresh: input.fresh,
      languageCode: input.language_code,
      locationCode: input.location_code,
      maxCostCents: input.max_cost_cents,
      scopeOverride: input.scope_override,
      target: input.target,
    }),
  );
}

async function domainOverviewPageInput<T extends typeof keywordPageBodySchema>(
  ctx: ApiContext,
  projectId: string,
  schema: T,
) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return { scoped } as const;
  const input = schema.parse(await readJsonBody(ctx));
  const invalidTarget = invalidTargetResponse(ctx, input.target, input.scope_override);
  if (invalidTarget) return { scoped: invalidTarget } as const;
  return { input } as const;
}

function pageOptions(input: z.infer<typeof relevantPageBodySchema>) {
  return {
    fresh: input.fresh,
    languageCode: input.language_code,
    limit: input.limit,
    locationCode: input.location_code,
    maxCostCents: input.max_cost_cents,
    offset: input.offset,
    scopeOverride: input.scope_override,
    target: input.target,
  };
}

export async function postDomainOverviewKeywords(ctx: ApiContext, projectId: string) {
  const parsed = await domainOverviewPageInput(ctx, projectId, keywordPageBodySchema);
  if ("scoped" in parsed) return parsed.scoped;
  return moduleResponse(
    ctx,
    await loadDomainKeywordsPage(serviceContext(ctx), pageOptions(parsed.input)),
  );
}

export async function postDomainOverviewPages(ctx: ApiContext, projectId: string) {
  const parsed = await domainOverviewPageInput(ctx, projectId, relevantPageBodySchema);
  if ("scoped" in parsed) return parsed.scoped;
  return moduleResponse(
    ctx,
    await loadDomainPagesPage(serviceContext(ctx), pageOptions(parsed.input)),
  );
}
