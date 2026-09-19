import type { ApiScope } from "./scope-policy";

/**
 * Estimate-only requests never call a provider and never reserve budget, so
 * they are downgraded from the declared `write` scope to `read` when the
 * request carries a strict estimate-only flag. The flag rules are stricter
 * than (or equal to) the handler parsing, so the downgrade never applies to a
 * request the handler would treat as a paid call.
 */
const ESTIMATE_ONLY_SHAPES = {
  analyzeBacklinks: "query",
  analyzeDomainOverview: "body",
  researchKeywords: "query",
} as const;

type EstimateFlagShape = (typeof ESTIMATE_ONLY_SHAPES)[keyof typeof ESTIMATE_ONLY_SHAPES];

function isEstimateOnlyRequest(input: {
  parsedBody?: unknown;
  shape: EstimateFlagShape;
  url: URL;
}) {
  if (input.shape === "query") {
    return input.url.searchParams.get("estimate_only") === "true";
  }
  return (
    typeof input.parsedBody === "object" &&
    input.parsedBody !== null &&
    (input.parsedBody as { estimate_only?: unknown }).estimate_only === true
  );
}

export function estimateOnlyScope(input: {
  operationId: string;
  parsedBody?: unknown;
  requiredScope: ApiScope;
  url: URL;
}): ApiScope {
  const shape = ESTIMATE_ONLY_SHAPES[input.operationId as keyof typeof ESTIMATE_ONLY_SHAPES];
  return shape && isEstimateOnlyRequest({ parsedBody: input.parsedBody, shape, url: input.url })
    ? "read"
    : input.requiredScope;
}

/**
 * Request-facing wrapper for the router: reads the JSON body from a clone of
 * the request, only for the one POST operation, so the handler can still read
 * the original body. A body that is not valid JSON is not estimate-only.
 */
export async function scopeToEnforce(
  operation: { operationId: string; requiredScope: ApiScope },
  req: Request,
  url: URL,
): Promise<ApiScope> {
  if (operation.operationId !== "analyzeDomainOverview") {
    return estimateOnlyScope({ ...operation, url });
  }
  let parsedBody: unknown;
  try {
    parsedBody = await req.clone().json();
  } catch {
    return operation.requiredScope;
  }
  return estimateOnlyScope({ ...operation, parsedBody, url });
}
