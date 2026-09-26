import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { ProjectDomainRequiredError } from "@/lib/projects/tracked-domain";
import type { AdmissionErrorDetails } from "@/lib/providers/admission-error-details";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { ProviderChainError } from "@/lib/rank-check/provider-chain-error";
import { RankCheckRunnerError } from "@/lib/rank-check/runner-error";
import {
  LaunchRankCheckRunError,
  UnrunnableInlineRankCheckError,
} from "@/lib/rank-check/runs/launch-types";
import { ZodError, z } from "zod";
import { budgetExhaustedResponse } from "./budget-exhausted";
import { ApiConflictError, ApiForbiddenError, ApiInputError, ApiNotFoundError } from "./errors";
import { errorResponse } from "./responses";

export function errorFromUnknown(
  error: unknown,
  headers: Headers,
  url: URL,
  admissionDetails?: AdmissionErrorDetails | null,
) {
  const instance = `urn:bisibility:api:v1:${url.pathname}`;
  if (error instanceof DeploymentAdmissionExhaustedError) {
    if (error.reason === "budget") {
      return budgetExhaustedResponse(
        { headers, instance },
        {
          detail: "Deployment spending budget is exhausted for this month.",
          scope: error.scope,
          surface: error.surface ?? "programmatic",
        },
      );
    }
    const cleanHeaders = new Headers(headers);
    cleanHeaders.delete("Retry-After");
    cleanHeaders.delete("RateLimit-Reset");
    return errorResponse(
      "credits_exhausted",
      "Deployment credits are exhausted. Ask the project owner to add credits in Billing or connect their own provider key.",
      402,
      {
        headers: cleanHeaders,
        instance,
        problemDetails: admissionDetails ?? { balance_cents: null },
      },
    );
  }
  if (
    error instanceof ProviderChainError &&
    error.admissionExhaustion instanceof DeploymentAdmissionExhaustedError
  ) {
    return errorFromUnknown(error.admissionExhaustion, headers, url, admissionDetails);
  }
  if (error instanceof ZodError) {
    return errorResponse("validation_failed", "Request input failed validation.", 400, {
      details: z.flattenError(error),
      headers,
      instance,
    });
  }
  if (error instanceof ApiInputError) {
    return errorResponse(error.code, error.message, 400, { headers, instance });
  }
  if (error instanceof SyntaxError) {
    return errorResponse("bad_request", error.message, 400, { headers, instance });
  }
  if (error instanceof ApiConflictError) {
    return errorResponse("conflict", error.message, 409, { headers, instance });
  }
  // The launch refuses the same keyword with a 409 before anything is created. Reaching the guard
  // one step later is still the caller's answer to give, not a server fault, so it gets the same
  // shape as its sibling - and the reason travels with it.
  if (error instanceof UnrunnableInlineRankCheckError) {
    return errorResponse("conflict", error.message, 409, {
      details: { code: error.reason },
      headers,
      instance,
    });
  }
  if (error instanceof ApiNotFoundError) {
    return errorResponse("not_found", error.message, 404, { headers, instance });
  }
  if (error instanceof ApiForbiddenError) {
    return errorResponse("forbidden", error.message, 403, { headers, instance });
  }
  if (isOperationAccessDeniedError(error)) {
    return errorResponse("forbidden", error.message, 403, { headers, instance });
  }
  if (error instanceof ProjectReadOnlyError) {
    return errorResponse("project_read_only", error.message, 423, { headers, instance });
  }
  if (error instanceof ProjectDomainRequiredError) {
    return errorResponse("project_domain_required", error.message, 422, { headers, instance });
  }
  if (error instanceof LaunchRankCheckRunError) {
    if (error.code === "budget_exhausted") {
      return budgetExhaustedResponse({ headers, instance }, { surface: "programmatic" });
    }
    if (error.code === "cost_limit_exceeded") {
      return errorResponse("cost_limit_exceeded", error.message, 422, {
        headers,
        instance,
        problemDetails: { estimated_cost_cents: error.estimatedCostCents },
      });
    }
    return errorResponse("provider_unavailable", error.message, 409, { headers, instance });
  }
  if (error instanceof BudgetExhaustedError) {
    return errorResponse("budget_exhausted", error.message, 429, { headers, instance });
  }
  if (error instanceof ProviderRateLimitedError) {
    const retryAfter = String(error.retryAfterSeconds());
    const limitedHeaders = new Headers(headers);
    limitedHeaders.set("Retry-After", retryAfter);
    limitedHeaders.set("RateLimit-Reset", retryAfter);
    return errorResponse("rate_limited", "Provider rate limit reached; retry shortly.", 429, {
      headers: limitedHeaders,
      instance,
    });
  }
  if (error instanceof RankCheckRunnerError) {
    if (error.code === "provider_rate_limited") {
      return errorResponse("rate_limited", "Provider rate limit reached; retry shortly.", 429, {
        headers,
        instance,
      });
    }
    let status = 400;
    if (error.code === "provider_failed") status = 502;
    else if (error.code === "keyword_not_found") status = 404;
    const detail =
      error.code === "provider_failed" ? "Rank check provider request failed." : error.message;
    return errorResponse("provider_unavailable", detail, status, { headers, instance });
  }

  return errorResponse("internal_server_error", "Unexpected API error.", 500, {
    headers,
    instance,
  });
}
