import { describe, expect, it } from "vitest";
import { API_VERSION_HEADER } from "./api-versions";
import { getOpenApiDocument } from "./openapi";

describe("rank-check OpenAPI resources", () => {
  it("documents async responses, project selectors, and omits jobs", () => {
    const document = getOpenApiDocument();
    const runCheck = document.paths["/keywords/{id}/checks"].post;

    expect(document.paths).not.toHaveProperty("/jobs/{job_id}");
    expect(runCheck).toMatchObject({
      parameters: expect.arrayContaining([
        expect.objectContaining({ name: API_VERSION_HEADER }),
        expect.objectContaining({ name: "async" }),
        { $ref: "#/components/parameters/ProjectHeader" },
        { $ref: "#/components/parameters/ProjectQuery" },
      ]),
      responses: {
        "202": expect.objectContaining({
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RankCheck" },
            },
          },
        }),
      },
    });
  });
});
