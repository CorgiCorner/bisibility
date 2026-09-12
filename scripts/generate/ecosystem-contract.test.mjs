import assert from "node:assert/strict";
import { test } from "node:test";
import {
  digest, extractCliHelp, renderCliReference, sourceFromArtifact, verifyDigest, verifyOperations,
} from "./ecosystem-contract.mjs";

test("rejects a changed artifact even when its download URL is unchanged", () => {
  const original = Buffer.from("published artifact");
  verifyDigest(original, digest(original));
  assert.throws(() => verifyDigest(Buffer.from("replacement"), digest(original)), /checksum/);
});

test("warns beside legacy check help without changing the published text", () => {
  const text = "--async Queue the check and return immediately with status running";
  const page = renderCliReference("0.7.0", [{ title: "check", text }]);
  const section = page.slice(page.indexOf("## check"));
  assert.match(section, /does not select execution mode/);
  assert.match(section, /201/);
  assert.match(section, /202/);
  assert.match(section, /queued/);
  assert.match(section, /run ID/);
  assert.match(section, /\[Checks\]\(\/api\/checks\)/);
  assert.ok(section.indexOf("<Warning>") < section.indexOf("```text"));
  assert.ok(section.includes(text));
});

test("requires a method declaration, not a README mention or a removed method", () => {
  const artifact = { id: "python", declaration: "python", operations: ["create_project"] };
  verifyOperations("    def create_project(\n", artifact);
  assert.throws(() => verifyOperations("# create_project is planned", artifact), /missing/);
  assert.throws(() => verifyOperations("    def create_project_api_key(\n", artifact), /missing/);
});

test("matches literal declaration prefixes for every published surface", () => {
  const declarations = {
    typescript: "    inspect(",
    python: "    def inspect(",
    go: "func (c *Client) inspect(",
    cli: "  bisibility inspect <target>",
    mcp: '    "inspect",',
  };
  for (const [declaration, source] of Object.entries(declarations)) {
    const artifact = { id: declaration, declaration, operations: ["inspect"] };
    verifyOperations(`header\r\n${source}\r\n`, artifact);
    assert.throws(() => verifyOperations(`comment ${source}`, artifact), /missing/);
    assert.throws(() => verifyOperations(source.replace("inspect", "inspectExtra"), artifact), /missing/);
    assert.throws(() => verifyOperations(source, { ...artifact, operations: ["(a+)+"] }), /Invalid/);
  }
});

test("extracts published source without executing it and rejects missing sources", () => {
  const map = JSON.stringify({ sources: ["help.ts"], sourcesContent: ["throw new Error()"] });
  assert.equal(sourceFromArtifact(map, { source: "help.ts" }), "throw new Error()");
  assert.throws(() => sourceFromArtifact(map, { source: "absent.ts" }), /Missing/);
});

test("preserves CLI flags and aliases and substitutes only the package version", () => {
  const help = 'export function mainHelp() { return `bisibility ${VERSION}\n  --json\n`; }';
  assert.deepEqual(extractCliHelp(help, "0.7.0"), [
    { title: "Commands and global options", text: "bisibility 0.7.0\n  --json" },
  ]);
  assert.throws(() => extractCliHelp(help.replace("${VERSION}", "${dynamic}"), "0.7.0"), /interpolation/);
  assert.throws(() => extractCliHelp(help.replace("return `", "return buildHelp(`"), "0.7.0"), /format changed/);
});
