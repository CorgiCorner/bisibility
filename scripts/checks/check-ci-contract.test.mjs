import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse, stringify } from "yaml";
import { validateCiContract } from "./check-ci-contract.mjs";

const source = readFileSync(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const checkerSource = readFileSync(new URL("./check-ci-contract.mjs", import.meta.url), "utf8");
const packageManifest = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

function mutate(change) {
  const workflow = parse(source);
  change(workflow);
  return stringify(workflow);
}

test("accepts the public CI contract", () => {
  assert.doesNotThrow(() => validateCiContract(source, "fixture"));
});

test("does not construct regular expressions from validator arguments", () => {
  assert.doesNotMatch(checkerSource, /\bnew\s+RegExp\s*\(/);
});

test("runs the release SAST gate before private changes can merge", () => {
  if (typeof packageManifest.scripts?.["security:sast"] !== "string") return;
  const workflow = parse(source);
  const commands = workflow.jobs.static.steps.flatMap((step) =>
    typeof step.run === "string" ? [step.run.trim()] : [],
  );
  assert.ok(commands.includes("npm run security:sast"));
});

test("rejects a missing PostgreSQL contract job", () => {
  const fixture = mutate((workflow) => {
    delete workflow.jobs["postgres-migration-contract"];
    workflow.jobs["ci-ok"].needs = workflow.jobs["ci-ok"].needs.filter(
      (name) => name !== "postgres-migration-contract",
    );
  });
  assert.throws(() => validateCiContract(fixture, "fixture"), /PostgreSQL migration contract/);
});

test("rejects a PostgreSQL contract job outside the ci-ok dependency closure", () => {
  const fixture = mutate((workflow) => {
    workflow.jobs["ci-ok"].needs = workflow.jobs["ci-ok"].needs.filter(
      (name) => name !== "postgres-migration-contract",
    );
  });
  assert.throws(() => validateCiContract(fixture, "fixture"), /must reach ci-ok/);
});

test("rejects a ci-ok step that ignores job results", () => {
  const fixture = mutate((workflow) => {
    const verification = workflow.jobs["ci-ok"].steps.find((step) =>
      String(step.run ?? "").includes("verify-required-jobs.mjs"),
    );
    verification.run = "echo success";
  });
  assert.throws(() => validateCiContract(fixture, "fixture"), /verify-required-jobs/);
});

test("rejects a ci-ok job that cannot read the repository verifier", () => {
  const fixture = mutate((workflow) => {
    workflow.jobs["ci-ok"].steps = workflow.jobs["ci-ok"].steps.filter(
      (step) => !String(step.uses ?? "").startsWith("actions\/checkout@"),
    );
  });
  assert.throws(() => validateCiContract(fixture, "fixture"), /check out the repository/);
});

test("accepts reordered multiline needs and an additional job", () => {
  const fixture = mutate((workflow) => {
    workflow.jobs.audit = {
      "runs-on": "ubuntu-latest",
      steps: [{ run: "echo audit" }],
    };
    workflow.jobs["ci-ok"].needs = [
      "postgres-migration-contract",
      "build",
      "coverage",
      "test",
      "static",
      "audit",
    ];
  });
  assert.doesNotThrow(() => validateCiContract(fixture, "fixture"));
});
