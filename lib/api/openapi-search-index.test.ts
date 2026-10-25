import { pageIndexingDescriptions } from "@/lib/mcp/page-indexing-contract";
import { searchIndexDescriptions } from "@/lib/mcp/search-index-contract";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";

describe("Page indexing OpenAPI guards", () => {
  it.each(Object.entries({ ...searchIndexDescriptions, ...pageIndexingDescriptions }))(
    "includes the description once for %s",
    (operationId, description) => {
      const operations = Object.values(getOpenApiDocument().paths).flatMap(Object.values);
      expect(operations.find((operation) => operation.operationId === operationId)).toHaveProperty(
        "description",
        description,
      );
    },
  );
  it.each([
    ["getPageIndexingReport", "Read Page indexing report"],
    ["listPageIndexingUrls", "List Page indexing URLs"],
    ["getPageIndexingSettings", "Read Page indexing settings"],
    ["updatePageIndexingSettings", "Update Page indexing settings"],
  ])("uses a human summary for %s", (operationId, summary) => {
    const operations = Object.values(getOpenApiDocument().paths).flatMap(Object.values);
    expect(operations.find((operation) => operation.operationId === operationId)).toHaveProperty(
      "summary",
      summary,
    );
  });
  it("requires the inspection body without changing other bearer operations", () => {
    const { paths } = getOpenApiDocument();
    expect(paths["/projects/{project_id}/search-index/inspections"].post).toHaveProperty(
      "requestBody.required",
      true,
    );
    expect(paths["/projects/{project_id}"].patch).toHaveProperty("requestBody.required", false);
    expect(paths["/projects/{project_id}/search-index/sitemaps/{path}"].get).not.toHaveProperty(
      "requestBody",
    );
  });
  it("declares an absolute HTTP or HTTPS sitemap URI with bounded length", () => {
    const { paths } = getOpenApiDocument();
    const parameters = paths["/projects/{project_id}/search-index/sitemaps/{path}"].get.parameters;
    expect(parameters).toContainEqual(
      expect.objectContaining({
        in: "path",
        name: "path",
        required: true,
        schema: {
          type: "string",
          minLength: 1,
          maxLength: 2048,
          format: "uri",
          pattern: "^[hH][tT][tT][pP][sS]?://",
        },
      }),
    );
  });
});
