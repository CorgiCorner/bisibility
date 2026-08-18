import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { describe, expect, it } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { getOpenApiDocument } from "./openapi";

describe("OpenAPI document", () => {
  it("groups every operation into an ordered API reference section", () => {
    const doc = getOpenApiDocument();
    const operations = Object.values(doc.paths).flatMap((path) => Object.values(path)) as Array<{
      operationId?: string;
      summary: string;
      tags?: string[];
    }>;

    expect(doc).toHaveProperty(
      "tags",
      [
        "discovery",
        "account-access",
        "projects",
        "api-keys",
        "keywords",
        "rank-checks",
        "keyword-research",
        "backlinks",
        "domain-overview",
        "analytics",
        "alerts",
        "competitors",
        "sitemap-monitoring",
        "saved-keywords",
        "saved-views",
        "signals",
        "providers",
        "webhooks",
        "team",
        "migration",
      ].map((name) => expect.objectContaining({ name })),
    );
    expect(operations).toHaveLength(100);
    expect(operations.every((operation) => operation.tags?.length === 1)).toBe(true);
    expect(
      operations.every(
        (operation) => typeof operation.summary === "string" && operation.summary.length <= 48,
      ),
    ).toBe(true);
    const referenceTitles = operations.map(
      (operation) => `${operation.tags?.[0]}:${operation.summary}`,
    );
    expect(new Set(referenceTitles).size).toBe(referenceTitles.length);
    expect(doc.paths["/projects"].get.tags).toEqual(["projects"]);
    expect(doc.paths["/projects/{project_id}/keywords"].get.tags).toEqual(["keywords"]);
    expect(doc.paths["/projects/{project_id}/alert-rules"].post.tags).toEqual(["alerts"]);
    expect(doc.paths["/projects/{project_id}/webhooks"].get.tags).toEqual(["webhooks"]);
    expect(doc.paths["/projects/{projectId}/domain-overview/analyze"].post.tags).toEqual([
      "domain-overview",
    ]);
  });

  it("documents the paid Domain Overview safety contract", () => {
    const doc = getOpenApiDocument();
    const analyze = doc.paths["/projects/{projectId}/domain-overview/analyze"].post;
    const history = doc.paths["/projects/{projectId}/domain-overview/history"].post;

    expect(analyze).toMatchObject({
      operationId: "analyzeDomainOverview",
      requestBody: { required: true },
      responses: {
        "200": expect.any(Object),
        "422": expect.any(Object),
        "429": expect.any(Object),
      },
    });
    expect(history).toMatchObject({
      operationId: "loadDomainOverviewHistory",
      requestBody: { required: true },
      responses: { "409": expect.any(Object), "422": expect.any(Object) },
    });
    expect(doc.components.schemas.DomainOverviewProblem).toMatchObject({
      allOf: expect.arrayContaining([
        expect.objectContaining({ $ref: "#/components/schemas/Problem" }),
      ]),
    });
    expect(doc.components.schemas.DomainOverviewMetrics.properties).toHaveProperty("pos1");
    expect(doc.components.schemas.DomainOverviewMetrics.properties).not.toHaveProperty("pos_1");
  });

  it("publishes executable Domain Overview request constraints", () => {
    const schemas = getOpenApiDocument().components.schemas;
    const schemaValidator = new AjvJsonSchemaValidator();
    const common = { language_code: "en", location_code: 2840, target: "example.com" };
    const analyze = schemaValidator.getValidator(schemas.DomainOverviewAnalyzeRequest as never);

    expect(analyze({ ...common, estimate_only: true }).valid).toBe(true);
    expect(analyze({ ...common, estimate_only: true, max_cost_cents: 0 }).valid).toBe(true);
    expect(analyze({ ...common, estimate_only: false, max_cost_cents: 6 }).valid).toBe(true);
    expect(analyze(common).valid).toBe(false);
    expect(analyze({ ...common, estimate_only: false }).valid).toBe(false);
    expect(analyze({ ...common, estimate_only: true, unknown: true }).valid).toBe(false);

    const keywords = schemaValidator.getValidator(schemas.DomainOverviewKeywordsRequest as never);
    const pages = schemaValidator.getValidator(schemas.DomainOverviewPagesRequest as never);
    expect(keywords({ ...common, limit: 100, max_cost_cents: 0, offset: 0 }).valid).toBe(true);
    expect(keywords({ ...common, limit: 101, max_cost_cents: 0, offset: 0 }).valid).toBe(false);
    expect(pages({ ...common, limit: 1_000, max_cost_cents: 0, offset: 0 }).valid).toBe(true);
    expect(pages({ ...common, limit: 1_001, max_cost_cents: 0, offset: 0 }).valid).toBe(false);
  });

  it("documents optional API version declarations and mismatch responses", () => {
    const doc = getOpenApiDocument();
    const operations = Object.values(doc.paths).flatMap((path) => Object.values(path)) as Array<{
      parameters: Array<{
        in: string;
        name: string;
        required: boolean;
        schema: { enum: string[]; type: string };
      }>;
      responses: Record<string, unknown>;
    }>;

    for (const operation of operations) {
      expect(operation.parameters).toContainEqual({
        description: expect.stringContaining("Omit this header"),
        in: "header",
        name: API_VERSION_HEADER,
        required: false,
        schema: { enum: ["v1"], type: "string" },
      });
      expect(operation.responses["409"]).toMatchObject({
        description: expect.stringContaining("Unsupported API version"),
      });
    }

    expect(
      doc.paths["/capabilities"].get.responses["200"].content["application/json"].schema,
    ).toMatchObject({
      properties: {
        apiVersions: {
          items: { enum: ["v1"], type: "string" },
          minItems: 1,
          type: "array",
        },
      },
      required: ["apiVersions", "data", "rank_check_scheduler_mode", "scheduler_driver"],
    });
  });
});
