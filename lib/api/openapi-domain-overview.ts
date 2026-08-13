type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
) => object;

export { domainOverviewSchemas } from "./openapi-domain-overview-schemas";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const problemResponse = (description: string) => ({
  content: { "application/json": { schema: ref("DomainOverviewProblem") } },
  description,
});

function operation(
  bearer: Bearer,
  summary: string,
  operationId: string,
  responseName: string,
  requestName: string,
  options: { conflict?: boolean; description: string },
) {
  const base = bearer(summary, operationId, ref(responseName), ref(requestName)) as {
    requestBody?: object;
    responses: Record<string, object>;
  };
  return {
    ...base,
    description: options.description,
    requestBody: { ...base.requestBody, required: true },
    responses: {
      ...base.responses,
      ...(options.conflict ? { "409": problemResponse("snapshot_expired") } : {}),
      "422": problemResponse(
        "unsupported_target, unsupported_location, needs_reauth, lookup_failed, or cost_limit_exceeded",
      ),
      "429": problemResponse("budget_exhausted, in_progress, or rate_limited"),
    },
  };
}

export function domainOverviewPaths(input: { bearer: Bearer }) {
  return {
    "/projects/{projectId}/domain-overview/analyze": {
      post: operation(
        input.bearer,
        "Estimate or analyze Domain Overview. Requires write scope.",
        "analyzeDomainOverview",
        "DomainOverviewAnalyzeResponse",
        "DomainOverviewAnalyzeRequest",
        {
          description:
            "estimate_only is a free cache-aware dry run. Paid analysis requires an explicit max_cost_cents, including zero for cache-only access. Charged partial reports return HTTP 200 with nested module failures and their costs.",
        },
      ),
    },
    "/projects/{projectId}/domain-overview/history": {
      post: operation(
        input.bearer,
        "Load Domain Overview history. Requires write scope.",
        "loadDomainOverviewHistory",
        "DomainOverviewHistoryResponse",
        "DomainOverviewHistoryRequest",
        {
          conflict: true,
          description:
            "Loads the priced history module for a current overview snapshot. max_cost_cents is required; use zero for cache-only access.",
        },
      ),
    },
    "/projects/{projectId}/domain-overview/keywords": {
      post: operation(
        input.bearer,
        "Load a Domain Overview keyword page. Requires write scope.",
        "loadDomainOverviewKeywords",
        "DomainOverviewKeywordsResponse",
        "DomainOverviewKeywordsRequest",
        {
          conflict: true,
          description:
            "Loads one provider-backed keyword page. max_cost_cents is required; use zero for cache-only access.",
        },
      ),
    },
    "/projects/{projectId}/domain-overview/pages": {
      post: operation(
        input.bearer,
        "Load a Domain Overview relevant-pages page. Requires write scope.",
        "loadDomainOverviewPages",
        "DomainOverviewPagesResponse",
        "DomainOverviewPagesRequest",
        {
          conflict: true,
          description:
            "Loads one provider-backed relevant-pages page. max_cost_cents is required; use zero for cache-only access.",
        },
      ),
    },
  };
}
