import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { checkMethodParity } from "../generate/docs-examples.mjs";

const methodsContent = readFileSync(resolve("docs/sdks/methods.mdx"), "utf8");
const mcpContract = JSON.parse(readFileSync(resolve("lib/mcp/canonical-contract.json"), "utf8"));
const mcpToolNames = new Set(mcpContract.map((tool) => tool.name));

function exampleSources() {
  return {
    python: readFileSync(resolve("examples/python/quickstart.py"), "utf8"),
    typescript: readFileSync(resolve("examples/ts/quickstart.ts"), "utf8"),
    go: readFileSync(resolve("examples/go/quickstart/main.go"), "utf8"),
  };
}

function failures(methods = methodsContent, sources = exampleSources(), tools = mcpToolNames) {
  return checkMethodParity({ methodsContent: methods, exampleSources: sources, mcpToolNames: tools });
}

describe("SDK method parity", () => {
  it("passes for the real methods table and runnable examples", () => {
    assert.deepEqual(failures(), []);
  });

  for (const [language, current, stale] of [
    ["typescript", "addKeywords", "createKeywords"],
    ["python", "create_keywords", "add_keywords"],
    ["go", "CreateKeywords", "AddKeywords"],
  ]) {
    it(`fails when the ${language} docs method is stale`, () => {
      const result = failures(methodsContent.replace(current, stale));
      assert.ok(result.some((failure) => failure.includes(language) && failure.includes(current)));
    });
  }

  it("fails when an MCP tool name is stale", () => {
    const stale = methodsContent.replace("| `add_keywords` |", "| `add_keywordz` |");
    assert.ok(failures(stale).some((failure) => failure.includes("MCP method add_keywordz")));
  });

  it("fails when an example contract omits a workflow", () => {
    const sources = exampleSources();
    sources.typescript = sources.typescript.replace(
      '  "Create a project": BisibilityClient.prototype.createProject,\n',
      "",
    );
    assert.ok(failures(methodsContent, sources).includes(
      "typescript example contract is missing workflow Create a project.",
    ));
  });

  it("fails when an example contract adds a workflow", () => {
    const sources = exampleSources();
    sources.python = sources.python.replace(
      "# docs:end:method-contract",
      '    "Unexpected": BisibilityClient.list_projects,\n# docs:end:method-contract',
    );
    assert.ok(failures(methodsContent, sources).includes("python example has extra workflow Unexpected."));
  });
});
