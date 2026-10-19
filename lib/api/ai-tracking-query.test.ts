import { describe, expect, it } from "vitest";
import { trackingQueryInput, trackingTrendsQuerySchema } from "./ai-tracking-query";
import { getOpenApiDocument } from "./openapi";

const runId = "air_a00000000000000000000000";

describe("AI tracking trends query", () => {
  it("requires a public run ID and drops empty values", () => {
    const input = trackingQueryInput(new URLSearchParams(`run_id=${runId}&previous_run_id=`));
    expect(trackingTrendsQuerySchema.parse(input)).toEqual({ run_id: runId });
    expect(trackingTrendsQuerySchema.safeParse({ run_id: "run_1" }).success).toBe(false);
    expect(trackingTrendsQuerySchema.safeParse({}).success).toBe(false);
  });

  it("documents the query the REST handler reads instead of the MCP paging fields", () => {
    const paths = getOpenApiDocument().paths as Record<
      string,
      Record<string, { parameters?: unknown }>
    >;
    const operation = paths["/projects/{project_id}/ai-tracking/trends"].get;
    const parameters = operation.parameters as Array<{
      in?: string;
      name?: string;
      required?: boolean;
      schema?: object;
    }>;
    const query = parameters.filter(
      (parameter) => parameter.in === "query" && parameter.name !== "project",
    );
    expect(query.map(({ name, required }) => [name, required])).toEqual([
      ["previous_run_id", false],
      ["run_id", true],
    ]);
    expect(query[1]?.schema).toMatchObject({ pattern: "^air_[a-z][a-z0-9]{23}$", type: "string" });
  });
});
