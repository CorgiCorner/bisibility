#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  digest, extractCliHelp, renderCliReference, renderCompatibility,
  sourceFromArtifact, verifyDigest, verifyOperations,
} from "./ecosystem-contract.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const contractPath = join(root, "scripts/generate/ecosystem-artifacts.json");
const snapshotPath = join(root, "scripts/generate/ecosystem.snapshot.json");
const contractText = readFileSync(contractPath, "utf8");
const contract = JSON.parse(contractText);
const mode = process.argv[2];
if (!["--check", "--write", "--refresh", "--verify-published"].includes(mode)) {
  throw new Error("Use --check, --write, --refresh, or --verify-published");
}
if (contract.schemaVersion !== 1 || contract.artifacts.length !== 5) {
  throw new Error("Expected the five-client ecosystem contract v1");
}

async function inspectPublished() {
  const temporary = mkdtempSync(join(tmpdir(), "bisibility-ecosystem-"));
  try {
    const evidence = [];
    let cliHelp;
    for (const artifact of contract.artifacts) {
      const url = new URL(artifact.url);
      if (url.protocol !== "https:" || ![
        "registry.npmjs.org", "files.pythonhosted.org", "proxy.golang.org",
      ].includes(url.hostname)) throw new Error("Unexpected package registry");
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: "error" });
      if (!response.ok) throw new Error(`${artifact.id}: registry returned ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      verifyDigest(bytes, artifact.sha256);
      const archive = join(temporary, "artifact");
      writeFileSync(archive, bytes);
      const options = { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 };
      // Read one member to stdout; never extract package paths or execute package code.
      const raw = url.pathname.endsWith(".zip")
        ? execFileSync("unzip", ["-p", archive, artifact.file], options)
        : execFileSync("tar", ["-xOzf", archive, artifact.file], options);
      const source = sourceFromArtifact(raw, artifact);
      verifyOperations(source, artifact);
      evidence.push({ id: artifact.id, sourceSha256: digest(source), operations: artifact.operations });
      if (artifact.id === "cli") cliHelp = extractCliHelp(source, artifact.version);
      console.log(`Verified ${artifact.package}@${artifact.version}`);
    }
    return { schemaVersion: 1, contractSha256: digest(contractText), evidence, cliHelp };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

const snapshot = mode === "--refresh" ? await inspectPublished()
  : JSON.parse(readFileSync(snapshotPath, "utf8"));
if (snapshot.schemaVersion !== 1 || snapshot.contractSha256 !== digest(contractText)) {
  throw new Error("Ecosystem artifact pins changed; run --refresh and review the generated diff");
}
if (mode === "--verify-published") {
  const actual = await inspectPublished();
  if (JSON.stringify(actual) !== JSON.stringify(snapshot)) {
    throw new Error("Published ecosystem evidence differs from the committed snapshot");
  }
}

const cli = contract.artifacts.find((artifact) => artifact.id === "cli");
const outputs = new Map([
  [snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`],
  [join(root, "docs/compatibility.mdx"), renderCompatibility(contract.artifacts)],
  [join(root, "docs/cli/reference.mdx"), renderCliReference(cli.version, snapshot.cliHelp)],
]);
const methodsPath = join(root, "docs/sdks/methods.mdx");
const methods = readFileSync(methodsPath, "utf8");
const marker = "## MCP tool index";
if (methods.split(marker).length !== 2) throw new Error("Missing or duplicate MCP index heading");
const tools = JSON.parse(readFileSync(join(root, "lib/mcp/canonical-contract.json"), "utf8"));
outputs.set(methodsPath, `${methods.split(marker)[0]}${marker}\n\n` +
  "{/* Generated from the application's canonical MCP contract. */}\n\n" +
  "These tools describe the application contract in this documentation snapshot.\n" +
  "The separately published MCP package is versioned independently; see\n" +
  "[released client support](/compatibility) for inspected package versions.\n\n" +
  "| Tool | Title |\n| - | - |\n" +
  tools.map(({ name, title }) => `| \`${name}\` | ${title} |`).join("\n") + "\n");
for (const [path, expected] of outputs) {
  if (mode === "--write" || mode === "--refresh") {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, expected);
  } else if (readFileSync(path, "utf8") !== expected) {
    throw new Error(`Stale generated reference: ${path.slice(root.length)}; run --write`);
  }
}
console.log("Ecosystem reference is current.");
