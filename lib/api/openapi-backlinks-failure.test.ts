import { describe, expect, it } from "vitest";
import { backlinksPaths, backlinksSchemas } from "./openapi-backlinks";

const ref = { $ref: "#/components/schemas/BacklinksFailedSummaryProblem" };

describe("backlinks failed evidence API contract", () => {
  it("documents unknown total separately from known summary cost in an error schema", () => {
    const schema = (backlinksSchemas as Record<string, unknown>).BacklinksFailedSummaryProblem;
    expect(schema).toMatchObject({
      allOf: [
        { $ref: "#/components/schemas/Problem" },
        {
          required: ["details"],
          properties: {
            details: {
              additionalProperties: false,
              properties: {
                cost_cents: { type: "null" },
                known_summary_cost_cents: { minimum: 0, type: "number" },
                history_failure: { additionalProperties: false },
                rows_status: { const: "not_requested" },
                status: { const: "failed" },
              },
            },
          },
        },
      ],
    });
  });

  it("keeps analyze failure HTTP500 and successful snapshot schemas separate", () => {
    const paths = backlinksPaths({
      bearer: () => ({
        responses: { "200": { description: "Success" }, "500": { description: "Error" } },
      }),
    });
    const operation = paths["/projects/{projectId}/backlinks"].get as {
      responses: Record<string, { content?: Record<string, { schema: { anyOf: unknown[] } }> }>;
    };
    expect(
      operation.responses["500"].content?.["application/problem+json"].schema.anyOf,
    ).toContainEqual(ref);
    expect(backlinksSchemas.BacklinksResponse.properties.data.oneOf).toEqual([
      { $ref: "#/components/schemas/BacklinksEstimate" },
      { $ref: "#/components/schemas/BacklinksSnapshot" },
    ]);
  });
});
