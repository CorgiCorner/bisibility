import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { checkRestGuideOperations } from "./rest-guide-links.mjs";

const openapi = {
  paths: {
    "/projects": {
      get: {
        operationId: "listProjects",
        summary: "List projects visible to this API key",
        tags: ["Projects"],
      },
    },
  },
};

describe("REST guide links", () => {
  it("requires a Related operations link to the generated reference href", () => {
    const docsRoot = mkdtempSync(join(tmpdir(), "rest-guide-links-"));
    mkdirSync(join(docsRoot, "api"), { recursive: true });
    writeFileSync(
      join(docsRoot, "api/projects.mdx"),
      "## Related operations\n\n`listProjects`\n",
    );

    const failures = checkRestGuideOperations({
      docsRoot,
      openapi,
      guides: { "api/projects.mdx": ["listProjects"] },
    });
    assert.ok(
      failures.some((failure) =>
        failure.includes("/api-reference/projects/list-projects-visible-to-this-api-key"),
      ),
    );
  });
});
