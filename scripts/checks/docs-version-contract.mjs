import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadDocsTestedClients(root) {
  return JSON.parse(readFileSync(join(root, "examples/docs-tested-clients.json"), "utf8"));
}

export function checkDocsVersionContract(root, docsRoot) {
  const failures = [];
  const manifest = loadDocsTestedClients(root);
  const versioningDocs = readFileSync(join(docsRoot, "versioning.mdx"), "utf8");
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const tsPackage = JSON.parse(readFileSync(join(root, "examples/ts/package.json"), "utf8"));
  const pythonRequirement = readFileSync(join(root, "examples/python/requirements.txt"), "utf8");
  const goMod = readFileSync(join(root, "examples/go/go.mod"), "utf8");
  const cliReadme = readFileSync(join(root, "examples/cli/README.md"), "utf8");
  const mcpQuickstart = readFileSync(join(root, "examples/mcp/quickstart.mjs"), "utf8");
  const mcpDocs = readFileSync(join(docsRoot, "sdks/mcp.mdx"), "utf8");
  const cliDocs = readFileSync(join(docsRoot, "cli.mdx"), "utf8");

  for (const header of [
    "Docs-tested version",
    "API contract",
    "Test artifact",
    "Last verified",
  ]) {
    if (!versioningDocs.includes(header)) {
      failures.push(`versioning.mdx is missing column ${header}`);
    }
  }

  if (manifest.clients.application.version_from === "package.json") {
    if (!versioningDocs.includes(`\`${packageJson.version}\``)) {
      failures.push("versioning.mdx must include the application version from package.json.");
    }
  }

  const pythonPin = pythonRequirement.match(/^bisibility==([0-9.]+)/m)?.[1];
  if (pythonPin !== manifest.clients.python.version) {
    failures.push("examples/docs-tested-clients.json Python version must match requirements.txt.");
  }

  const goPin = goMod.match(/^require bisibility\.com\/sdk-go (v[0-9.]+)/m)?.[1];
  if (goPin !== manifest.clients.go.version) {
    failures.push("examples/docs-tested-clients.json Go version must match go.mod.");
  }

  if (tsPackage.dependencies["@bisibility/sdk"] !== manifest.clients.typescript.version) {
    failures.push("examples/ts/package.json must pin @bisibility/sdk to the docs-tested version.");
  }

  for (const [id, client] of Object.entries(manifest.clients)) {
    if (id === "application" || id === "rest") continue;
    if (!versioningDocs.includes(`\`${client.version}\``)) {
      failures.push(`versioning.mdx must include docs-tested ${id} version ${client.version}.`);
    }
    if (!versioningDocs.includes(client.artifact)) {
      failures.push(`versioning.mdx must cite test artifact ${client.artifact}.`);
    }
  }

  const mcpPin = `@bisibility/mcp@${manifest.clients.mcp.version}`;
  if (!mcpDocs.includes(mcpPin)) {
    failures.push(`sdks/mcp.mdx must pin ${mcpPin}.`);
  }
  if (!mcpQuickstart.includes(mcpPin) && !mcpQuickstart.includes(`@bisibility/mcp@${manifest.clients.mcp.version}`)) {
    failures.push(`examples/mcp/quickstart.mjs must pin ${mcpPin}.`);
  }

  const cliPin = `@bisibility/cli@${manifest.clients.cli.version}`;
  if (!cliDocs.includes(cliPin) && !cliDocs.includes(manifest.clients.cli.version)) {
    failures.push("cli.mdx must include the docs-tested CLI version.");
  }
  if (!cliReadme.includes(cliPin) && !cliReadme.includes(`@bisibility/cli@${manifest.clients.cli.version}`)) {
    failures.push("examples/cli/README.md must pin the docs-tested CLI version.");
  }

  return failures;
}
