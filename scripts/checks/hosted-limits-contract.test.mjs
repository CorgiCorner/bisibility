import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, cpSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { HOSTED_LIMITS } from "../contracts/hosted-limits.mjs";
import { check, envFilesFromArgs } from "./hosted-limits-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function makeTempDocs() {
  const tmp = mkdtempSync(path.join(tmpdir(), "hosted-limits-test-"));
  const docsDir = path.join(tmp, "docs");
  mkdirSync(docsDir, { recursive: true });
  cpSync(path.join(root, "docs"), docsDir, { recursive: true });
  return { tmp, docsDir };
}

describe("hosted-limits-contract checker", () => {
  it("passes when the canonical page has both values and no other page duplicates them", () => {
    const errors = check();
    assert.equal(errors.length, 0, errors.join("\n"));
  });

  it("rejects a canonical page missing a hosted limit value", () => {
    const { tmp, docsDir } = makeTempDocs();
    try {
      const canonical = path.join(docsDir, "deployment-options.mdx");
      let content = readFileSync(canonical, "utf8");
      content = content.replace("1,000", "999,999");
      writeFileSync(canonical, content);

      const errors = check({ docsRoot: docsDir, canonicalPage: canonical });
      assert.ok(errors.length > 0, "should report missing value");
      assert.ok(errors.some((e) => e.includes("missing")), errors.join("\n"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a non-canonical page that duplicates a current hosted limit value", () => {
    const { tmp, docsDir } = makeTempDocs();
    try {
      const configFile = path.join(docsDir, "self-hosting", "configuration.mdx");
      let content = readFileSync(configFile, "utf8");
      content = content.replace(
        "BISIBILITY_MAX_PROJECTS_PER_USER` |",
        "BISIBILITY_MAX_PROJECTS_PER_USER` | The hosted beta uses `3`.",
      );
      writeFileSync(configFile, content);

      const errors = check({
        docsRoot: docsDir,
        canonicalPage: path.join(docsDir, "deployment-options.mdx"),
      });
      assert.ok(errors.length > 0, "should report duplicated value");
      assert.ok(errors.some((e) => e.includes("configuration.mdx")), errors.join("\n"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a non-canonical page that duplicates the keyword limit phrase", () => {
    const { tmp, docsDir } = makeTempDocs();
    try {
      const configFile = path.join(docsDir, "self-hosting", "configuration.mdx");
      let content = readFileSync(configFile, "utf8");
      content += "\n\nThe hosted beta allows 1,000 keywords per project.\n";
      writeFileSync(configFile, content);

      const errors = check({
        docsRoot: docsDir,
        canonicalPage: path.join(docsDir, "deployment-options.mdx"),
      });
      assert.ok(errors.length > 0, "should report duplicated value");
      assert.ok(errors.some((e) => e.includes("configuration.mdx")), errors.join("\n"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not match a hosted keyword limit embedded in a larger number", () => {
    const { tmp, docsDir } = makeTempDocs();
    try {
      const configFile = path.join(docsDir, "self-hosting", "configuration.mdx");
      let content = readFileSync(configFile, "utf8");
      content += "\n\nA separate example allows 11000 keywords per project.\n";
      writeFileSync(configFile, content);

      const errors = check({
        docsRoot: docsDir,
        canonicalPage: path.join(docsDir, "deployment-options.mdx"),
      });
      assert.equal(errors.length, 0, errors.join("\n"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("hosted-limits contract values", () => {
  it("owns the exact key/value pairs", () => {
    assert.equal(HOSTED_LIMITS.BISIBILITY_MAX_KEYWORDS_PER_PROJECT, "1000");
    assert.equal(HOSTED_LIMITS.BISIBILITY_MAX_PROJECTS_PER_USER, "3");
  });
});

describe("hosted-limits env-template checker", () => {
  function makeTempEnv(content) {
    const tmp = mkdtempSync(path.join(tmpdir(), "hosted-limits-env-"));
    const envFile = path.join(tmp, ".env.example");
    writeFileSync(envFile, content);
    return { tmp, envFile };
  }

  it("rejects a reintroduced keyword value in a root-style env template", () => {
    const { tmp, envFile } = makeTempEnv("# BISIBILITY_MAX_KEYWORDS_PER_PROJECT=1000\n");
    try {
      const errors = check({ envFiles: [envFile] });
      assert.ok(errors.length > 0, "should report value in env template");
      assert.ok(
        errors.some((e) => e.includes("BISIBILITY_MAX_KEYWORDS_PER_PROJECT") && e.includes("1000")),
        errors.join("\n"),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a reintroduced project value in a public-override env template", () => {
    const { tmp, envFile } = makeTempEnv("# BISIBILITY_MAX_PROJECTS_PER_USER=3\n");
    try {
      const errors = check({ envFiles: [envFile] });
      assert.ok(errors.length > 0, "should report value in env template");
      assert.ok(
        errors.some((e) => e.includes("BISIBILITY_MAX_PROJECTS_PER_USER") && e.includes("3")),
        errors.join("\n"),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not false-positive on blank optional entries or mechanism-only comments", () => {
    const { tmp, envFile } = makeTempEnv(
      [
        "# Optional per-project keyword cap. Unset or 0 means unlimited.",
        "# BISIBILITY_MAX_KEYWORDS_PER_PROJECT=",
        "# Optional cap on projects owned by one user. Unset or 0 means unlimited.",
        "# BISIBILITY_MAX_PROJECTS_PER_USER=",
        "# See docs/deployment-options.mdx for current hosted beta limits.",
      ].join("\n") + "\n",
    );
    try {
      const errors = check({ envFiles: [envFile] });
      assert.equal(errors.length, 0, errors.join("\n"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("hosted-limits env-file arguments", () => {
  it("uses the root starter by default", () => {
    assert.deepEqual(envFilesFromArgs([]), [path.join(root, ".env.example")]);
  });

  it("accepts repeatable repo-relative env files", () => {
    assert.deepEqual(
      envFilesFromArgs([
        "--env-file",
        ".env.example",
        "--env-file",
        "fixtures/extra.env",
      ]),
      [
        path.join(root, ".env.example"),
        path.join(root, "fixtures/extra.env"),
      ],
    );
  });

  it("rejects missing, absolute, and escaping paths", () => {
    assert.throws(() => envFilesFromArgs(["--env-file"]), /repo-relative path/);
    assert.throws(() => envFilesFromArgs(["--env-file", path.resolve("/tmp/env")]), /repo-relative path/);
    assert.throws(() => envFilesFromArgs(["--env-file", "../outside"]), /inside the repository/);
  });
});
