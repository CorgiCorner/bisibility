import "server-only";

import { getActionActor, ProjectNotFoundError } from "@/lib/actions/_shared";
import { appAdmissionErrorDetails } from "@/lib/api/admission-error-details";
import { budgetExhaustedResponse } from "@/lib/api/budget-exhausted";
import { ApiConflictError, ApiInputError, ApiNotFoundError } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/responses";
import { type Actor, AuthorizationError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/session";
import { ProjectDomainRequiredError } from "@/lib/projects/tracked-domain";
import type { AdmissionErrorDetails } from "@/lib/providers/admission-error-details";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderChainError } from "@/lib/rank-check/provider-chain-error";
import { LaunchRankCheckRunError, SampleProjectError } from "@/lib/rank-check/runs/launch-types";
import { PreviewTokenError } from "@/lib/rank-check/runs/preview-token";
import { DefaultCheckScheduleDeletionError } from "@/lib/rank-check/schedules/service";
import { ZodError } from "zod";

const CACHE_HEADERS = { "Cache-Control": "private, no-store" };
const APP_INSTANCE = "urn:bisibility:app:rank-check-runs:error";

type AppRouteHandler<TContext> = (
  request: Request,
  actor: Actor,
  context: TContext,
) => Promise<Response>;

function problem(
  code: Parameters<typeof errorResponse>[0],
  detail: string,
  status: number,
  details?: unknown,
) {
  return errorResponse(code, detail, status, {
    details,
    headers: CACHE_HEADERS,
    instance: APP_INSTANCE,
  });
}

function mappedError(
  error: unknown,
  admissionDetails?: AdmissionErrorDetails | null,
): Response | null {
  if (
    error instanceof ProviderChainError &&
    error.admissionExhaustion instanceof DeploymentAdmissionExhaustedError
  ) {
    return mappedError(error.admissionExhaustion, admissionDetails);
  }
  if (error instanceof DeploymentAdmissionExhaustedError) {
    if (error.reason === "budget") {
      return budgetExhaustedResponse(
        { headers: new Headers(CACHE_HEADERS), instance: APP_INSTANCE },
        {
          detail: "Deployment spending budget is exhausted for this month.",
          scope: error.scope,
          surface: error.surface ?? "app",
        },
      );
    }
    return errorResponse(
      "credits_exhausted",
      "Deployment credits are exhausted. Ask the project owner to add credits in Billing or connect their own provider key.",
      402,
      {
        headers: CACHE_HEADERS,
        instance: APP_INSTANCE,
        problemDetails: admissionDetails ?? { balance_cents: null },
      },
    );
  }
  if (error instanceof AuthorizationError) {
    return error.code === "unauthenticated"
      ? problem("unauthorized", error.message, 401)
      : problem("forbidden", error.message, 403);
  }
  if (error instanceof ProjectNotFoundError || error instanceof ApiNotFoundError) {
    return problem("not_found", error.message, 404);
  }
  if (error instanceof ApiInputError) {
    return problem(error.code, error.message, 400);
  }
  if (error instanceof ProjectDomainRequiredError) {
    return problem("project_domain_required", error.message, 422);
  }
  if (error instanceof SampleProjectError) {
    return problem("sample_project", error.message, 403);
  }
  if (error instanceof ZodError) {
    return problem("validation_failed", "Request validation failed.", 400, error.flatten());
  }
  if (error instanceof PreviewTokenError) {
    return problem("conflict", error.message, 409, { code: error.code });
  }
  if (error instanceof LaunchRankCheckRunError) {
    if (error.code === "cost_limit_exceeded") {
      // App routes never set max_cost_cents, so this code cannot arrive here; mapped defensively
      // so a future caller still gets the API's shape instead of a 500.
      return problem("cost_limit_exceeded", error.message, 422, {
        code: error.code,
        estimated_cost_cents: error.estimatedCostCents,
      });
    }
    if (error.code === "budget_exhausted") {
      return budgetExhaustedResponse(
        { headers: new Headers(CACHE_HEADERS), instance: APP_INSTANCE },
        { detail: error.message, surface: "app" },
      );
    }
    return problem("provider_unavailable", error.message, 409, {
      code: error.code,
      surface: "app",
    });
  }
  if (error instanceof ApiConflictError) {
    return problem("conflict", error.message, 409);
  }
  if (error instanceof DefaultCheckScheduleDeletionError) {
    return problem("conflict", error.message, 409);
  }
  return null;
}

export function withAppRoute<TContext = undefined>(handler: AppRouteHandler<TContext>) {
  return async (request: Request, context?: TContext) => {
    let actor: Actor | null = null;
    try {
      if (!(await getSession())) {
        throw new AuthorizationError("unauthenticated", "Authentication is required.");
      }
      actor = await getActionActor();
      const response = await handler(request, actor, context as TContext);
      response.headers.set("Cache-Control", CACHE_HEADERS["Cache-Control"]);
      return response;
    } catch (error) {
      const details = await appAdmissionErrorDetails(error, actor);
      const response = mappedError(error, details);
      if (response) return response;
      console.error("[rank-check-runs] App route failed.", error);
      return problem("internal_server_error", "The request could not be completed.", 500);
    }
  };
}
