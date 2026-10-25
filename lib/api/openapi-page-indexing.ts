import {
  pageIndexingDescriptions,
  pageIndexingToolSchemas,
} from "@/lib/mcp/page-indexing-contract";
import type { schemas } from "./openapi-components";
import { openApiOperationPresentation } from "./openapi-operation-presentation";
import { problemResponse } from "./openapi-problem";
import { closedEnum } from "./openapi-sdk-schema";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
) => object;
export function pageIndexingPaths(input: {
  bearer: Bearer;
  ref: (name: keyof typeof schemas) => object;
}) {
  function operation(
    id: keyof typeof pageIndexingDescriptions,
    response: keyof typeof schemas,
    body?: object,
    parameters?: object[],
  ) {
    const base = input.bearer(
      openApiOperationPresentation[id].summary,
      id,
      input.ref(response),
      body,
      parameters,
    );
    return {
      ...base,
      description: pageIndexingDescriptions[id],
      responses: {
        ...(base as { responses: object }).responses,
        "400": problemResponse(
          "Invalid Page indexing filters or settings; available_quota is self-host only.",
        ),
        "404": problemResponse("No connected Search Console property."),
      },
    };
  }
  const { project_id: _project, ...filters } =
    pageIndexingToolSchemas.listPageIndexingUrls.properties;
  return {
    "/projects/{project_id}/search-index/report": {
      get: operation("getPageIndexingReport", "PageIndexingReport"),
    },
    "/projects/{project_id}/search-index/urls": {
      get: operation(
        "listPageIndexingUrls",
        "PageIndexingUrls",
        undefined,
        Object.entries(filters).map(([name, schema]) => ({
          in: "query",
          name,
          required: false,
          schema: {
            ...schema,
            ...(["group", "source", "history"].includes(name)
              ? closedEnum(`PageIndexing${name[0].toUpperCase()}${name.slice(1)}Filter`)
              : {}),
          },
        })),
      ),
    },
    "/projects/{project_id}/search-index/settings": {
      get: operation("getPageIndexingSettings", "PageIndexingSettings"),
      patch: operation(
        "updatePageIndexingSettings",
        "PageIndexingSettings",
        input.ref("PageIndexingSettingsPatch"),
        [{ $ref: "#/components/parameters/IdempotencyKey" }],
      ),
    },
  };
}
