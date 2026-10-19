import { aiTrackingSchemas } from "@/lib/mcp/tracking-contract";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { appOwnedTrackingParameters } from "./openapi-tracking-parameters";

type Parameter = { $ref?: string; in?: string; name?: string; schema?: Record<string, unknown> };

const withoutExtensions = (schema: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries(schema).filter(([key]) => !key.startsWith("x-bisibility-")));

function operation(operationId: string) {
  for (const methods of Object.values(getOpenApiDocument().paths)) {
    for (const candidate of Object.values(methods as Record<string, { operationId?: string }>)) {
      if (candidate.operationId === operationId) {
        return candidate as { parameters: Parameter[]; responses: Record<string, unknown> };
      }
    }
  }
  throw new Error(`Missing operation ${operationId}`);
}

describe("app-owned AI tracking reads", () => {
  const owned = Object.keys(
    appOwnedTrackingParameters,
  ) as (keyof typeof appOwnedTrackingParameters)[];

  it.each(owned)("%s publishes the app-owned parameters, not the MCP input", (operationId) => {
    const published = operation(operationId)
      .parameters.filter((parameter) => parameter.in === "path" || parameter.in === "query")
      .map(({ schema, ...parameter }) => ({ ...parameter, schema: withoutExtensions(schema) }));
    expect(published).toEqual(appOwnedTrackingParameters[operationId]);
  });

  it.each(owned)("%s accepts every app-owned field in its MCP tool too", (operationId) => {
    const mcp = aiTrackingSchemas()[operationId].properties ?? {};
    for (const parameter of appOwnedTrackingParameters[operationId]) {
      expect(mcp[parameter.name], parameter.name).toEqual(parameter.schema);
    }
  });

  it("names the response schemas of the generator's first wave", () => {
    const ref = (operationId: string) =>
      (
        operation(operationId).responses["200"] as {
          content: { "application/json": { schema: { $ref?: string } } };
        }
      ).content["application/json"].schema.$ref;
    expect(ref("listAiTrackingPrompts")).toBe("#/components/schemas/AiTrackingPromptPage");
    expect(ref("getAiTrackingHistory")).toBe("#/components/schemas/AiTrackingRunPage");
    expect(ref("getAiTrackingTrends")).toBe("#/components/schemas/AiTrackingTrendsResponse");
    expect(ref("getHealth")).toBe("#/components/schemas/HealthStatus");
  });
});
