import "server-only";

import { getActionActor, ProjectNotFoundError } from "@/lib/actions/_shared";
import { ApiConflictError, ApiInputError, ApiNotFoundError } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/responses";
import { type Actor, AuthorizationError } from "@/lib/auth/authorize";
import { getSession } from "@/lib/auth/session";
import { ProjectDomainRequiredError } from "@/lib/projects/tracked-domain";
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

function mappedError(error: unknown) {
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
    const code = error.code === "budget_exhausted" ? "budget_exhausted" : "provider_unavailable";
    return problem(code, error.message, 409, { code: error.code });
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
    try {
      if (!(await getSession())) {
        throw new AuthorizationError("unauthenticated", "Authentication is required.");
      }
      const response = await handler(request, await getActionActor(), context as TContext);
      response.headers.set("Cache-Control", CACHE_HEADERS["Cache-Control"]);
      return response;
    } catch (error) {
      const response = mappedError(error);
      if (response) return response;
      console.error("[rank-check-runs] App route failed.", error);
      return problem("internal_server_error", "The request could not be completed.", 500);
    }
  };
}
