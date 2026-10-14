import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { expect, it } from "vitest";
import { z } from "zod";
import fixture from "./local-monitor-transport-fixture.json";
import { getOpenApiDocument } from "./openapi";
import { localMonitorResultSchemas } from "./openapi-local-monitor-results";

it("validates actual five Local handler bodies, retained nulls/CID/quality and export JSON against the served schema", () => {
  const validator = new AjvJsonSchemaValidator();
  for (const [key, schema] of [
    ["result", "LocalMonitorRunResult"],
    ["result_unknown", "LocalMonitorRunResult"],
    ["result_stale", "LocalMonitorRunResult"],
    ["history", "LocalMonitorRunHistory"],
    ["point_history", "LocalMonitorPointHistory"],
    ["listings", "LocalMonitorPointListings"],
    ["export_json", "LocalMonitorPointReport"],
  ] as const) {
    const check = validator.getValidator(localMonitorResultSchemas[schema]);
    expect(check(fixture[key]), key).toMatchObject({ valid: true });
  }
  const legacy = structuredClone(fixture.result);
  legacy.data.points[0].zoom = 5.5;
  expect(
    validator.getValidator(localMonitorResultSchemas.LocalMonitorRunResult)(legacy).valid,
  ).toBe(true);
  const check = validator.getValidator(localMonitorResultSchemas.LocalMonitorPointListings);
  const unsafe = structuredClone(fixture.listings);
  const wrong = {
    ...unsafe,
    data: unsafe.data.map((item, index) =>
      index === 0 ? { ...item, cid: 9007199254740993000 } : item,
    ),
  };
  expect(check(wrong).valid).toBe(false);
});
it("advertises only five authenticated GET routes with bounded signed history cursor and original scope IDs", () => {
  const doc = getOpenApiDocument();
  const paths = Object.entries(doc.paths).filter(([path]) => path.includes("/local-monitors/"));
  expect(paths).toHaveLength(5);
  const expected = new Set([
    "listLocalMonitorRuns",
    "getLocalMonitorRunResults",
    "listLocalMonitorPointListings",
    "listLocalMonitorPointHistory",
    "exportLocalMonitorRun",
  ]);
  for (const [path, methods] of paths) {
    expect(Object.keys(methods)).toEqual(["get"]);
    const operation = z
      .object({
        get: z.object({
          operationId: z.string(),
          security: z.unknown(),
          parameters: z.array(z.unknown()).optional(),
          responses: z.record(z.string(), z.unknown()),
        }),
      })
      .parse(methods).get;
    expect(operation).toBeDefined();
    if (!operation) throw new Error("Missing Local read operation");
    expect(expected.delete(operation.operationId)).toBe(true);
    expect(operation.security).toEqual([{ ProjectApiKey: [] }, { PersonalAccessToken: [] }]);
    expect(operation.responses["402"]).toBeUndefined();
    expect(operation.responses["409"]).toBeDefined();
    expect(operation.responses["413"]).toBeDefined();
    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: "project_id", in: "path", required: true }),
    );
    if (path.endsWith("/runs") || path.endsWith("/history"))
      expect(operation.parameters).toContainEqual(
        expect.objectContaining({
          name: "cursor",
          schema: { type: "string", minLength: 1, maxLength: 8000 },
        }),
      );
    if (path.endsWith("/export"))
      expect(operation.responses["200"]).toMatchObject({
        content: { "application/json": {}, "text/csv": {} },
      });
  }
  expect(expected.size).toBe(0);
});
