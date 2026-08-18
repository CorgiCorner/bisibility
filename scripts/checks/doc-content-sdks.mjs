import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { walk } from "./doc-content-helpers.mjs";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkSdkContract(root, docsRoot) {
  const failures = [];

  const apiOverviewDocs = readFileSync(join(docsRoot, "api/overview.mdx"), "utf8");
  if (apiOverviewDocs.includes("## Client libraries")) {
    failures.push("api/overview.mdx duplicates the SDK section with a client-library section.");
  }
  if ((apiOverviewDocs.match(/\/sdks\/overview/g) ?? []).length !== 1) {
    failures.push("api/overview.mdx must link to the SDK overview exactly once.");
  }

  const sdkOverviewDocs = readFileSync(join(docsRoot, "sdks/overview.mdx"), "utf8");
  for (const term of ["language-level methods", "HTTP contract", "SDK method reference"]) {
    if (!sdkOverviewDocs.includes(term)) {
      failures.push(`sdks/overview.mdx is missing API/SDK ownership guidance: ${term}`);
    }
  }

  const sdkMethodsPath = join(docsRoot, "sdks/methods.mdx");
  if (!existsSync(sdkMethodsPath)) {
    failures.push("SDK method reference is missing: sdks/methods.mdx");
  } else {
    const sdkMethodsDocs = readFileSync(sdkMethodsPath, "utf8");
    for (const term of [
      "list_projects",
      "listProjects",
      "ListProjects",
      "create_project",
      "createProject",
      "CreateProject",
      "create_keywords",
      "addKeywords",
      "CreateKeywords",
      "add_keywords",
      "run_rank_check",
      "runRankCheck",
      "RunRankCheck",
      "get_rank_check_result",
      "getRankCheckResult",
      "GetRankCheckResult",
    ]) {
      if (!sdkMethodsDocs.includes(term)) {
        failures.push(`sdks/methods.mdx is missing language method mapping: ${term}`);
      }
    }
  }

  for (const sdkPage of ["python", "typescript", "go", "mcp"]) {
    const sdkDocs = readFileSync(join(docsRoot, `sdks/${sdkPage}.mdx`), "utf8");
    if (!sdkDocs.includes("/sdks/methods")) {
      failures.push(`sdks/${sdkPage}.mdx does not link to the SDK method reference.`);
    }
  }

  const canonicalMcpContract = JSON.parse(
    readFileSync(join(root, "lib/mcp/canonical-contract.json"), "utf8"),
  );
  const mcpFacingFiles = [
    join(root, "README.md"),
    join(docsRoot, "sdks/mcp.mdx"),
    ...walk(join(root, "examples/mcp")).filter((file) => !file.includes("/node_modules/")),
  ];
  const legacyMcpNames = canonicalMcpContract.flatMap(({ name }) => {
    const camelCase = name.replaceAll(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
    return [camelCase, `bisibility_${name}`];
  });

  for (const file of mcpFacingFiles) {
    const source = readFileSync(file, "utf8");
    for (const legacyName of legacyMcpNames) {
      if (new RegExp(`\\b${escapeRegex(legacyName)}\\b`).test(source)) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp - legacyName derives from the committed MCP contract and is regex-escaped.
        failures.push(
          `${relative(root, file)} uses legacy MCP tool name ${legacyName}; use the canonical unprefixed snake_case name.`,
        );
      }
    }
  }

  return failures;
}
