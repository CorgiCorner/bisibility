import { expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";

it("registers existing rank-run reads as top-level OpenAPI paths", () => {
  const paths = getOpenApiDocument().paths;
  const list = paths["/projects/{project_id}/rank-check-runs"].get;
  const detail = paths["/projects/{project_id}/rank-check-runs/{run_id}"].get;
  expect(list).toMatchObject({
    operationId: "listRankCheckRuns",
    parameters: expect.arrayContaining([
      expect.objectContaining({ name: "segment", in: "query" }),
      expect.objectContaining({ name: "cursor", in: "query" }),
      expect.objectContaining({ name: "limit", in: "query" }),
    ]),
  });
  expect(detail).toMatchObject({ operationId: "getRankCheckRun" });
  for (const operation of [list, detail]) {
    expect(operation).toMatchObject({
      security: expect.any(Array),
      responses: { "200": expect.any(Object) },
    });
  }
  const history = paths["/projects/{project_id}/exports/rank-history"].get;
  expect(Object.keys(history).some((key) => key.startsWith("/"))).toBe(false);
  expect(history).toMatchObject({
    operationId: "exportRankHistory",
    responses: { "200": { content: { "text/csv": expect.any(Object) } } },
  });
});
