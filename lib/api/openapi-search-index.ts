import { searchIndexDescriptions } from "@/lib/mcp/search-index-contract";
import type { schemas } from "./openapi-components";
import { problemResponse } from "./openapi-problem";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
  options?: { requestRequired?: boolean },
) => object;

export function searchIndexPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  const summaries = {
    listSearchIndexSitemaps: "List Page indexing sitemaps",
    getSearchIndexSitemap: "Get a Page indexing sitemap",
    inspectSearchIndexUrls: "Inspect Page indexing URLs",
  };
  function operation(
    id: keyof typeof searchIndexDescriptions,
    response: keyof typeof schemas,
    body?: object,
    parameters?: object[],
    options?: { requestRequired?: boolean },
  ) {
    const base = input.bearer(summaries[id], id, input.ref(response), body, parameters, options);
    return {
      ...base,
      description: searchIndexDescriptions[id],
      responses: {
        ...(base as { responses: object }).responses,
        "400": problemResponse(
          "URL must belong to the connected property or request validation failed.",
        ),
        "404": problemResponse(
          id === "getSearchIndexSitemap"
            ? "No connected property, or sitemap not found in Search Console for this property."
            : "No connected property, or Search Console property not found.",
        ),
        "502": problemResponse("Search Console request failed."),
        "422": problemResponse(
          "Provider authorization must be renewed, or Search Console denied access to this property; check that the connected account can access it.",
        ),
      },
    };
  }
  return {
    "/projects/{project_id}/search-index/sitemaps": {
      get: operation("listSearchIndexSitemaps", "SearchIndexSitemaps"),
    },
    "/projects/{project_id}/search-index/sitemaps/{path}": {
      get: operation("getSearchIndexSitemap", "SearchIndexSitemapResponse", undefined, [
        {
          in: "path",
          name: "path",
          required: true,
          description:
            "Absolute http(s) sitemap URL, URL-encoded as one path segment, within the connected property. The values . and .. are rejected.",
          schema: {
            type: "string",
            minLength: 1,
            maxLength: 2048,
            format: "uri",
            pattern: "^[hH][tT][tT][pP][sS]?://",
          },
        },
      ]),
    },
    "/projects/{project_id}/search-index/inspections": {
      post: operation(
        "inspectSearchIndexUrls",
        "SearchIndexInspections",
        input.ref("SearchIndexInspectionInput"),
        [{ $ref: "#/components/parameters/IdempotencyKey" }],
        { requestRequired: true },
      ),
    },
  };
}
