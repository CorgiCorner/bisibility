import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { RESOURCE_LIMIT_KEYS, assertResourceLimits } from "../contracts/hosted-limits.mjs";
import { check, envFilesFromArgs } from "./hosted-limits-contract.mjs";
function fixture(extra = "", env = "") {
  const tmp = mkdtempSync(path.join(tmpdir(), "resource-limits-"));
  const docsRoot = path.join(tmp, "docs");
  mkdirSync(docsRoot);
  const canonicalPage = path.join(docsRoot, "deployment-options.mdx");
  const envFile = path.join(tmp, ".env.example");
  writeFileSync(canonicalPage, `See [plans](https://bisibility.com/pricing). Unset or \`0\` means unlimited.\n${extra}`);
  writeFileSync(envFile, env);
  return { tmp, options: { docsRoot, canonicalPage, envFiles: [envFile] } };
}
function runFixture(extra, env, assertion) {
  const f = fixture(extra, env);
  try { assertion(check(f.options)); } finally { rmSync(f.tmp, { recursive: true, force: true }); }
}
describe("resource limits are operator knobs, not hosted commercial defaults", () => {
  it("exports only names and accepts unset, zero and positive integer overrides", () => {
    assert.equal(RESOURCE_LIMIT_KEYS.length, 2);
    for (const value of [undefined, "", "0", "23"]) {
      assert.doesNotThrow(() => assertResourceLimits(Object.fromEntries(RESOURCE_LIMIT_KEYS.map((key) => [key, value]))));
    }
  });
  it("rejects malformed overrides", () => {
    for (const value of ["-1", "1.5", "abc", "Infinity", "999999999999999999999"]) {
      assert.throws(() => assertResourceLimits({ [RESOURCE_LIMIT_KEYS[0]]: value }), /non-negative safe integer/);
    }
  });
  it("passes current docs", () => assert.deepEqual(check(), []));
  it("rejects stale and new hosted claims", () => {
    for (const claim of ["1,000 keywords per project", "3 owned projects per user", "Cloud includes 750 scheduled keywords", "Solo includes 5 projects"]) {
      runFixture(claim, "", (errors) => assert.ok(errors.some((error) => error.includes("commercial"))));
    }
  });
  it("requires the pricing link and unlimited rule", () => {
    const f = fixture();
    try {
      writeFileSync(f.options.canonicalPage, "Optional resource limits.");
      assert.equal(check(f.options).length, 2);
    } finally { rmSync(f.tmp, { recursive: true, force: true }); }
  });
  it("rejects numeric defaults in environment templates", () => {
    for (const key of RESOURCE_LIMIT_KEYS) runFixture("", `# ${key}=42`, (errors) => assert.ok(errors.length));
  });
  it("allows optional blank values and unlimited documentation", () => runFixture("", "# Unset or 0 means unlimited.\n# BISIBILITY_MAX_PROJECTS_PER_USER=", (errors) => assert.deepEqual(errors, [])));
  it("restricts env arguments to the repository", () => {
    assert.equal(envFilesFromArgs([]).length, 1);
    assert.equal(envFilesFromArgs(["--env-file", ".env.example"]).length, 1);
    for (const args of [["--env-file"], ["--env-file", "/tmp/env"], ["--env-file", "../outside"]]) assert.throws(() => envFilesFromArgs(args));
  });
});
