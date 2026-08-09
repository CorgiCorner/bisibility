import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "bad_request"
  | "budget_exhausted"
  | "conflict"
  | "cost_limit_exceeded"
  | "forbidden"
  | "internal_server_error"
  | "invalid_cursor"
  | "invalid_public_id"
  | "lookup_in_progress"
  | "method_not_allowed"
  | "not_found"
  | "project_domain_required"
  | "project_read_only"
  | "provider_unavailable"
  | "rate_limited"
  | "scheduler_unavailable"
  | "self_import"
  | "snapshot_expired"
  | "unauthorized"
  | "unsupported_api_version"
  | "unsupported_target"
  | "unsupported_location"
  | "validation_failed";

export type ApiMeta = Record<string, unknown>;

export type ApiEnvelope<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  docs_url: string;
  errors?: unknown;
};

type ApiResponseInit = {
  details?: unknown;
  headers?: HeadersInit;
  instance?: string;
  meta?: ApiMeta;
  status?: number;
};

const docsBaseUrl = "https://bisibility.com/docs/api/errors";

const errorTitles = {
  bad_request: "Bad request",
  budget_exhausted: "Budget exhausted",
  conflict: "Conflict",
  cost_limit_exceeded: "Cost limit exceeded",
  forbidden: "Forbidden",
  internal_server_error: "Internal server error",
  invalid_cursor: "Invalid cursor",
  invalid_public_id: "Invalid public ID",
  lookup_in_progress: "Lookup in progress",
  method_not_allowed: "Method not allowed",
  not_found: "Not found",
  project_domain_required: "Project domain required",
  project_read_only: "Project read-only",
  provider_unavailable: "Provider unavailable",
  rate_limited: "Rate limit exceeded",
  scheduler_unavailable: "Scheduler unavailable",
  self_import: "Self import blocked",
  snapshot_expired: "Snapshot expired",
  unauthorized: "Unauthorized",
  unsupported_api_version: "Unsupported API version",
  unsupported_target: "Unsupported target",
  unsupported_location: "Unsupported location",
  validation_failed: "Validation failed",
} satisfies Record<ApiErrorCode, string>;

export function jsonResponse<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, init);
}

export function textResponse(body: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "text/plain; charset=utf-8");

  return new NextResponse(body, { ...init, headers });
}

export function dataResponse<T>(data: T, init: ApiResponseInit = {}) {
  const body: ApiEnvelope<T> = init.meta ? { data, meta: init.meta } : { data };

  return jsonResponse(body, { headers: init.headers, status: init.status ?? 200 });
}

export function listResponse<T>(data: T[], nextCursor: string | null, init: ApiResponseInit = {}) {
  return dataResponse(data, {
    ...init,
    meta: { ...init.meta, next_cursor: nextCursor },
  });
}

export function resourceResponse<T>(resource: T, init: ApiResponseInit = {}) {
  return jsonResponse(resource, { headers: init.headers, status: init.status ?? 200 });
}

export function errorResponse(
  code: ApiErrorCode,
  detail: string,
  status: number,
  init: ApiResponseInit = {},
) {
  const docsUrl = `${docsBaseUrl}#${code}`;
  const body: ProblemDetails = {
    detail,
    docs_url: docsUrl,
    instance: init.instance ?? "urn:bisibility:api:v1:error",
    status,
    title: errorTitles[code],
    type: `https://bisibility.com/problems/${code}`,
  };
  if (init.details !== undefined) {
    body.errors = init.details;
  }

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/problem+json");

  return jsonResponse(body, { headers, status });
}

export function methodNotAllowed(methods: readonly string[], init: ApiResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Allow", methods.join(", "));

  return errorResponse("method_not_allowed", "Method not allowed.", 405, { headers });
}

export function routeNotFound(init: ApiResponseInit = {}) {
  return errorResponse("not_found", "Route not found.", 404, init);
}
