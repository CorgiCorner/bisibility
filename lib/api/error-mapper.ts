import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { BudgetExhaustedError } from "@/lib/rank-check/budget";
import { RankCheckRunnerError } from "@/lib/rank-check/runner";
import { ZodError, z } from "zod";
import { ApiConflictError, ApiInputError, ApiNotFoundError } from "./errors";
import { errorResponse } from "./responses";

export function errorFromUnknown(error: unknown, headers: Headers, url: URL) {
  const instance = `urn:bisibility:api:v1:${url.pathname}`;
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
  if (error instanceof ApiNotFoundError) {
    return errorResponse("not_found", error.message, 404, { headers, instance });
  }
  if (error instanceof ProjectReadOnlyError) {
    return errorResponse("project_read_only", error.message, 423, { headers, instance });
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
