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
  DomainModulePaymentOutcome,
  DomainOverviewLookupFailure,
  DomainOverviewOutcome,
} from "@/lib/domain-overview/types";
import { READINESS_REASON } from "@/lib/projects/readiness";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { z } from "zod";
import {
  actionPaymentInputFromWire,
  paymentFailureResponse,
  paymentResource,
} from "./action-payment";
import { budgetExhaustedResponse } from "./budget-exhausted";
import type { ApiContext } from "./context";
import {
  analyzeBodySchema,
  historyBodySchema,
  keywordPageBodySchema,
  relevantPageBodySchema,
} from "./domain-overview-input";
import { providerOrigin } from "./request-origin";
import { dataResponse, errorResponse } from "./responses";
import { retryHeaders } from "./retry-headers";
import { readJsonBody, scopedProject, snakeizeKeys } from "./surface";

export {
  analyzeBodySchema,
  historyBodySchema,
  keywordPageBodySchema,
  relevantPageBodySchema,
} from "./domain-overview-input";

function failureDetails(outcome: DomainOverviewLookupFailure) {
  return {
    cost_cents: outcome.costCents,
    reason: outcome.reason,
    ...(outcome.phase ? { phase: outcome.phase } : {}),
    ...(outcome.providerCode ? { provider_code: outcome.providerCode } : {}),
    ...(outcome.reason === "in_progress" || outcome.reason === "rate_limited"
      ? { reset_at: outcome.resetAt ?? null }
      : {}),
  };
}

function lookupError(ctx: ApiContext, outcome: DomainOverviewLookupFailure) {
  return paymentFailureResponse(lookupErrorBase(ctx, outcome), outcome);
}
function lookupErrorBase(ctx: ApiContext, outcome: DomainOverviewLookupFailure) {
  if (outcome.reason === "wallet_budget_exhausted")
    return budgetExhaustedResponse(ctx, {
      scope: "wallet",
      surface: surfaceOf(providerOrigin(ctx.origin).source),
    });
  if (outcome.reason === "own_credentials_required")
    return errorResponse("byok_required", "This action requires your own provider key.", 422, {
      headers: ctx.headers,
      instance: ctx.instance,
      details: failureDetails(outcome),
    });
  if (outcome.reason === "insufficient_credits")
    return errorResponse(
      "credits_exhausted",
      "Available credits do not cover the remaining work. Review retained payment before retrying.",
      402,
      { headers: ctx.headers, instance: ctx.instance, details: failureDetails(outcome) },
    );
  if (outcome.reason.startsWith("payment_"))
    return errorResponse(
      "conflict",
      "Review a current payment quote before running this action.",
      409,
      { headers: ctx.headers, instance: ctx.instance, problemDetails: { reason: outcome.reason } },
    );
  const common = {
    details: failureDetails(outcome),
    headers: ctx.headers,
    instance: ctx.instance,
  };
  if (outcome.reason === "no_source") {
    return errorResponse(
      "not_found",
      `No eligible Domain Overview source is connected. Reason: ${READINESS_REASON.providerNotConnected}.`,
      404,
      common,
    );
  }
  if (outcome.reason === "budget_exhausted") {
    return budgetExhaustedResponse(ctx, {
      reason: outcome.budgetReason,
      surface: "programmatic",
      ...(outcome.provider === undefined ? {} : { provider: outcome.provider }),
    });
  }
  if (outcome.reason === "cost_limit_exceeded") {
    return errorResponse(
      "cost_limit_exceeded",
      "The estimated provider cost exceeds max_cost_cents.",
      422,
      {
        ...common,
        ...(outcome.estimatedCostCents === undefined
          ? {}
          : { problemDetails: { estimated_cost_cents: outcome.estimatedCostCents } }),
      },
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

function successResponse<T extends { ok: true } & Parameters<typeof paymentResource>[0]>(
  ctx: ApiContext,
  outcome: T,
) {
  const { ok: _ok, ...data } = outcome;
  return dataResponse(
    { ...(snakeizeKeys(data) as object), ...paymentResource(outcome) },
    { headers: ctx.headers },
  );
}

function outcomeResponse(ctx: ApiContext, outcome: DomainOverviewOutcome) {
  return outcome.ok ? successResponse(ctx, outcome) : lookupError(ctx, outcome);
}

function moduleResponse<T>(ctx: ApiContext, outcome: DomainModulePaymentOutcome<T>) {
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
  return {
    actorId: ctx.actorId,
    origin: providerOrigin(ctx.origin),
    projectId: ctx.auth.project.id,
  };
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
        ...actionPaymentInputFromWire(input),
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
      ...actionPaymentInputFromWire(input),
      estimateOnly: input.estimate_only,
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
    ...actionPaymentInputFromWire(input),
    estimateOnly: input.estimate_only,
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
