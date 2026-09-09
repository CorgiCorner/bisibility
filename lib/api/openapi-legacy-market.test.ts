import { describe, expect, it } from "vitest";
import { getCapabilities } from "./capabilities";
import { LEGACY_MARKET_INPUT_SUNSET_VERSION } from "./legacy-market-input";
import { getOpenApiDocument } from "./openapi";
import type { Parameter } from "./openapi-test-helpers";

type Property = { deprecated?: boolean; description?: string; enum?: unknown[] };
type SchemaName = keyof ReturnType<typeof getOpenApiDocument>["components"]["schemas"];

function properties(name: SchemaName) {
  return (getOpenApiDocument().components.schemas[name] as { properties: Record<string, Property> })
    .properties;
}

describe("legacy market inputs in the OpenAPI document", () => {
  it("deprecates every legacy market-name input in favor of location_key", () => {
    const expectations: Record<string, string[]> = {
      KeywordCreateItem: ["city", "country", "language", "location"],
      KeywordPatch: ["city", "country", "location"],
      ProjectDefaultsPatch: ["city", "country"],
    };

    for (const [schema, fields] of Object.entries(expectations)) {
      const props = properties(schema as SchemaName);
      for (const field of fields) {
        expect(props[field], `${schema}.${field}`).toMatchObject({
          deprecated: true,
          description: expect.stringContaining(LEGACY_MARKET_INPUT_SUNSET_VERSION),
        });
      }
      expect(props.location_key, `${schema}.location_key`).toMatchObject({
        description: expect.stringContaining("Primary location reference"),
      });
      expect(props.location_key?.deprecated).toBeUndefined();
    }
  });

  it("keeps the legacy country enum on deprecated inputs and plain strings on responses", () => {
    expect(properties("KeywordCreateItem").country?.enum).toEqual(
      expect.arrayContaining(["United States", "Germany"]),
    );
    expect(properties("KeywordPatch").location?.enum).toEqual(
      expect.arrayContaining(["United States", "Germany"]),
    );
    expect(properties("Keyword").country).not.toHaveProperty("enum");
    expect(properties("ProjectDefaults").country).not.toHaveProperty("enum");
    expect(properties("ProjectDefaults").country?.deprecated).toBeUndefined();
    expect(properties("KeywordCreateItem").device).toMatchObject({ enum: ["desktop", "mobile"] });
  });

  it("adds a location_key list filter and deprecates the country filter", () => {
    const parameters = getOpenApiDocument().paths["/projects/{project_id}/keywords"].get
      .parameters as (Parameter & { deprecated?: boolean; description?: string })[];
    const names = parameters.map((parameter) => parameter.name);

    expect(names.indexOf("location_key")).toBeGreaterThan(names.indexOf("device"));
    expect(names.indexOf("location_key")).toBeLessThan(names.indexOf("country"));
    expect(parameters.find((parameter) => parameter.name === "location_key")).toMatchObject({
      description: expect.stringContaining("filter[location_key]"),
      schema: { type: "string" },
    });
    expect(parameters.find((parameter) => parameter.name === "country")).toMatchObject({
      deprecated: true,
      description: expect.stringContaining(LEGACY_MARKET_INPUT_SUNSET_VERSION),
    });
  });

  it("exposes location_key on the agent tool schemas and deprecates their country inputs", () => {
    const tools = new Map(
      getCapabilities().map((tool) => [
        tool.name,
        tool.input_schema as { properties: Record<string, Property> },
      ]),
    );

    for (const name of ["addKeywords", "listKeywords", "updateProjectDefaults"] as const) {
      const schema = tools.get(name);
      expect(schema?.properties.location_key, name).toMatchObject({ type: "string" });
      expect(schema?.properties.country, name).toMatchObject({
        deprecated: true,
        description: expect.stringContaining(LEGACY_MARKET_INPUT_SUNSET_VERSION),
        enum: expect.arrayContaining(["United States"]),
      });
      expect(schema?.properties.country).not.toHaveProperty("default");
    }
  });
});
