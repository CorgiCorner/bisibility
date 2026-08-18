import { describe, expect, it } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { getCapabilities } from "./capabilities";
import { getOpenApiDocument } from "./openapi";
import type { Parameter } from "./openapi-test-helpers";

describe("OpenAPI document", () => {
  it("documents keyword list filters", () => {
    const operation = getOpenApiDocument().paths["/projects/{project_id}/keywords"].get;
    const parameters = operation.parameters as Parameter[];

    expect(parameters.map((parameter) => parameter.name)).toEqual([
      API_VERSION_HEADER,
      "limit",
      "cursor",
      "search",
      "tag",
      "topic",
      "intent",
      "device",
      "country",
      "position_gt",
      "position_lt",
      "sort",
    ]);
    expect(parameters.find((parameter) => parameter.name === "topic")?.schema).toMatchObject({
      maxLength: 80,
      minLength: 1,
      type: "string",
    });
    expect(parameters.find((parameter) => parameter.name === "intent")?.schema).toMatchObject({
      maxLength: 80,
      minLength: 1,
      type: "string",
    });
    expect(parameters.find((parameter) => parameter.name === "sort")?.schema).toMatchObject({
      enum: [
        "created_at",
        "-created_at",
        "keyword",
        "-keyword",
        "text",
        "-text",
        "updated_at",
        "-updated_at",
      ],
    });
  });

  it("documents bounded, joinable keyword matching with market and position fields", () => {
    const doc = getOpenApiDocument();
    const operation = doc.paths["/projects/{project_id}/keyword-matches"].post;
    const request = doc.components.schemas.KeywordMatchRequest;
    const match = doc.components.schemas.KeywordMatch;
    const market = doc.components.schemas.KeywordMatchMarket;

    expect(operation).toMatchObject({
      operationId: "matchProjectKeywords",
      requestBody: { required: true },
    });
    expect(request.properties.texts).toMatchObject({
      items: { maxLength: 180, minLength: 1, type: "string" },
      maxItems: 50,
      minItems: 1,
    });
    expect(match.required).toEqual(
      expect.arrayContaining(["matched_text", "market", "latest_position", "previous_position"]),
    );
    expect(match.properties.text).toMatchObject({
      description: expect.stringContaining("Stored keyword text"),
    });
    expect(market.properties.location_key).toMatchObject({ example: "ES/Andalusia/Malaga@en" });
    expect(market.required).toEqual(
      expect.arrayContaining([
        "location",
        "location_key",
        "country_code",
        "language_code",
        "language_label",
        "device",
      ]),
    );
  });

  it("documents both project defaults verbs", () => {
    const doc = getOpenApiDocument();
    const path = doc.paths["/projects/{project_id}/defaults"];

    expect(Object.keys(path).sort()).toEqual(["get", "patch"]);
    expect(path.get).toMatchObject({ operationId: "getProjectDefaults" });
    expect(path.patch).toMatchObject({ operationId: "updateProjectDefaults" });
    expect(doc.components.schemas.ProjectDefaultsPatch.properties.jitter_minutes).toMatchObject({
      maximum: 120,
      minimum: 0,
    });
    expect(doc.components.schemas.ProjectDefaultsPatch.properties.timezone).toMatchObject({
      description: expect.stringContaining("anchors monthly and custom cron wall-clock schedules"),
    });
    expect(doc.components.schemas.KeywordCreateItem.properties.schedule).toMatchObject({
      properties: {
        jitter_minutes: { default: 60, maximum: 120, minimum: 0 },
        timezone: {
          description: expect.stringContaining(
            "Daily and weekly use a stable keyword-specific interval phase",
          ),
        },
      },
    });
    expect(
      getCapabilities().find((tool) => tool.name === "updateProjectDefaults")?.input_schema,
    ).toMatchObject({
      properties: { jitter_minutes: { maximum: 120, minimum: 0 } },
    });
  });

  it("documents rank-check list filters and cursor pagination", () => {
    const operation = getOpenApiDocument().paths["/keywords/{id}/rank-checks"].get;
    const parameters = operation.parameters as Parameter[];
    const responseSchema = operation.responses["200"].content["application/json"].schema;

    expect(parameters.map((parameter) => parameter.name ?? parameter.$ref)).toEqual([
      API_VERSION_HEADER,
      "limit",
      "cursor",
      "status",
      "since",
      "until",
      "#/components/parameters/ProjectHeader",
      "#/components/parameters/ProjectQuery",
    ]);
    expect(parameters.find((parameter) => parameter.name === "status")?.schema).toMatchObject({
      enum: ["completed", "failed", "running"],
    });
    expect(responseSchema).toMatchObject({
      properties: {
        meta: {
          properties: {
            next_cursor: { type: ["string", "null"] },
          },
        },
      },
    });
  });

  it("declares personal-token project selection on project-resolving paths only", () => {
    const document = getOpenApiDocument();
    expect(document.components.parameters.ProjectHeader).toMatchObject({
      in: "header",
      name: "X-Bisibility-Project",
    });
    expect(document.components.parameters.ProjectQuery).toMatchObject({
      in: "query",
      name: "project",
    });

    const selectionRefs = (operation: { parameters?: object[] }) =>
      ((operation.parameters ?? []) as Parameter[])
        .map((parameter) => parameter.$ref)
        .filter((ref) => ref?.startsWith("#/components/parameters/Project"));
    expect(selectionRefs(document.paths["/rank-checks/{check_id}"].get)).toEqual([
      "#/components/parameters/ProjectHeader",
      "#/components/parameters/ProjectQuery",
    ]);
    expect(selectionRefs(document.paths["/signals"].post)).toEqual([
      "#/components/parameters/ProjectHeader",
      "#/components/parameters/ProjectQuery",
    ]);
    for (const exempt of [
      document.paths["/projects"].get,
      document.paths["/projects/{project_id}"].get,
      document.paths["/me"].get,
      document.paths["/locations/search"].get,
    ]) {
      expect(selectionRefs(exempt)).toEqual([]);
    }
  });
});
