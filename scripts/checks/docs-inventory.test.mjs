import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deployedOpenApiMatches, diffDocsInventory, expectedDocsInventory, parseLlmsTxt } from "./docs-inventory.mjs";

describe("docs inventory", () => {
  it("detects a stale execution contract even when every URL still exists", () => {
    const expected = { paths: { "/checks": { post: { responses: { 201: {}, 202: {} } } } } };
    const stale = { paths: { "/checks": { post: { responses: { 201: {} } } } } };
    assert.equal(deployedOpenApiMatches(expected, JSON.parse(JSON.stringify(expected))), true);
    assert.equal(deployedOpenApiMatches(expected, stale), false);
  });
  it("does not expect HTTP operation strings to be deployed page URLs", () => {
    const inventory = expectedDocsInventory({ docsRoot: fileURLToPath(new URL("../../docs", import.meta.url)) });
    assert.ok(inventory.authored.includes("index"));
    assert.ok(inventory.authored.includes("self-hosting/docker"));
    assert.ok(inventory.reference.length > 50);
    assert.deepEqual(inventory.authored.filter((page) => /^(GET|POST|PATCH|PUT|DELETE) /.test(page)), []);
  });
  it("parses Mintlify llms.txt entries", () => {
    const paths = parseLlmsTxt(`
- [Quickstart](https://bisibility.com/docs/quickstart.md)
- [Get API capabilities](https://bisibility.com/docs/api-reference/discovery/get-api-capabilities.md)
`);
    assert.deepEqual(paths, [
      "quickstart",
      "api-reference/discovery/get-api-capabilities",
    ]);
  });

  it("reports missing authored pages", () => {
    const diff = diffDocsInventory(
      { authored: ["versioning"], reference: [] },
      ["quickstart"],
    );
    assert.ok(diff.missingFromLive.includes("versioning"));
  });
});
