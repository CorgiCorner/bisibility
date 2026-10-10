import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { checkMethodParity, parseMethodsTable } from "../generate/docs-examples.mjs";

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

  it("separates unreleased source operations from released runnable workflows", () => {
    assert.equal(parseMethodsTable(methodsContent).length, 5);
    assert.equal(parseMethodsTable(methodsContent, { includeSourceMethods: true }).length, 32);
    const reclassified = methodsContent.replace("| Source operation |", "| Workflow |");
    assert.ok(failures(reclassified).some((failure) => failure.includes("missing workflow get AI research Catalog")));
  });

  it("still checks canonical MCP names in the unreleased source matrix", () => {
    const stale = methodsContent.replace("| `get_ai_research_catalog` |\n", "| `get_ai_research_catalog_stale` |\n");
    assert.ok(failures(stale).includes("MCP method get_ai_research_catalog_stale is not canonical."));
  });

  it("requires examples for additional released workflow tables after source operations", () => {
    const extra = `${methodsContent}\n\n| Workflow | Python | TypeScript | Go | MCP tool |\n| - | - | - | - | - |\n| New released workflow | \`list_projects\` | \`listProjects\` | \`ListProjects\` | \`list_projects\` |\n`;
    assert.ok(failures(extra).includes("typescript example contract is missing workflow New released workflow."));
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
