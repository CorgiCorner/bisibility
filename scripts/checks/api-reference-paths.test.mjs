import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationReferenceIndex, slug } from "./api-reference-paths.mjs";

describe("API reference paths", () => {
  it("slugs OpenAPI summaries the same way as the generated reference", () => {
    assert.equal(slug("List projects visible to this API key"), "list-projects-visible-to-this-api-key");
    assert.equal(slug("GET /projects"), "get-projects");
  });

  it("maps operation IDs to generated reference hrefs", () => {
    const index = operationReferenceIndex({
      paths: {
        "/projects": {
          get: {
            operationId: "listProjects",
            summary: "List projects visible to this API key",
            tags: ["Projects"],
          },
        },
      },
    });

    assert.deepEqual(index.get("listProjects"), {
      href: "/api-reference/projects/list-projects-visible-to-this-api-key",
      method: "GET",
      operationId: "listProjects",
      path: "/projects",
      summary: "List projects visible to this API key",
    });
  });
});
