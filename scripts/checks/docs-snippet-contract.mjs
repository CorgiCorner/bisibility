import { readFileSync } from "node:fs";
import { join } from "node:path";

const copyableSnippets = [
  {
    id: "typescript-list-projects",
    path: "examples/ts/list-projects.ts",
    required: [
      'import { BisibilityClient } from "@bisibility/sdk";',
      "process.env.BISIBILITY_API_KEY",
      "process.env.BISIBILITY_BASE_URL",
      "bisibility.projects.list()",
    ],
    forbidden: ["requiredEnv", "listProjects("],
  },
  {
    id: "python-list-projects",
    path: "examples/python/list_projects.py",
    required: [
      "import os",
      "from bisibility import BisibilityClient",
      'os.environ["BISIBILITY_API_KEY"]',
      "client.list_projects()",
    ],
    forbidden: ["required_env", "try:"],
  },
  {
    id: "go-list-projects",
    path: "examples/go/list-projects/main.go",
    required: [
      'bisibility "bisibility.com/sdk-go"',
      'os.Getenv("BISIBILITY_API_KEY")',
      "client.ListProjects",
    ],
    forbidden: ["requiredEnv"],
  },
];

export function checkDocsSnippetContract(root, docsRoot) {
  const failures = [];
  const pages = {
    typescript: readFileSync(join(docsRoot, "sdks/typescript.mdx"), "utf8"),
    python: readFileSync(join(docsRoot, "sdks/python.mdx"), "utf8"),
    go: readFileSync(join(docsRoot, "sdks/go.mdx"), "utf8"),
    mcp: readFileSync(join(docsRoot, "sdks/mcp.mdx"), "utf8"),
    api: readFileSync(join(docsRoot, "api/quickstart.mdx"), "utf8"),
  };

  for (const snippet of copyableSnippets) {
    const source = readFileSync(join(root, snippet.path), "utf8");
    for (const term of snippet.required) {
      if (!source.includes(term)) {
        failures.push(`${snippet.path} is not a standalone ${snippet.id} example: missing ${term}`);
      }
    }
    for (const term of snippet.forbidden) {
      if (source.includes(term)) {
        failures.push(`${snippet.path} must not depend on ${term}`);
      }
    }
  }

  if (!pages.typescript.includes("bisibility.projects.list()")) {
    failures.push("sdks/typescript.mdx must show the current projects.list() client form.");
  }
  if (pages.typescript.includes("client.listProjects()")) {
    failures.push("sdks/typescript.mdx must not recommend deprecated listProjects().");
  }
  if (!pages.python.includes("from bisibility import BisibilityClient")) {
    failures.push("sdks/python.mdx must include a complete import in the copyable example.");
  }
  if (!pages.go.includes('bisibility "bisibility.com/sdk-go"')) {
    failures.push("sdks/go.mdx must include a complete Go module import in the copyable example.");
  }
  if (!pages.mcp.includes("npx -y @bisibility/mcp@")) {
    failures.push("sdks/mcp.mdx must start from a pinned npx server command.");
  }
  if (pages.mcp.includes("serverLaunch(")) {
    failures.push("sdks/mcp.mdx must not present the integration-test helper as the quickstart.");
  }
  if (!pages.api.includes("BISIBILITY_TOKEN") || !pages.api.includes("await fetch(")) {
    failures.push("api/quickstart.mdx must include a raw JavaScript first-request example.");
  }

  return failures;
}
