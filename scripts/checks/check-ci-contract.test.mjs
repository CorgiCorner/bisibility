import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

const pathologicalShardShapes = [
  "[" + " ".repeat(50_000),
  "[" + "1 ".repeat(20_000),
  "[" + " 1 ".repeat(8_000) + "x",
];

function validateInChild(fixture) {
  const validatorUrl = new URL("./check-ci-contract.mjs", import.meta.url).href;
  const runner = `
    import { performance } from "node:perf_hooks";
    import { validateCiContract } from ${JSON.stringify(validatorUrl)};
    let source = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { source += chunk; });
    process.stdin.on("end", () => {
      const started = performance.now();
      validateCiContract(source, "fixture");
      process.stdout.write(JSON.stringify({ elapsedMs: performance.now() - started }));
    });
  `;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", runner], {
    encoding: "utf8",
    input: fixture,
    timeout: 5_000,
  });
}

test("accepts the public CI contract", () => {
  assert.doesNotThrow(() => validateCiContract(source, "fixture"));
});

test("accepts realistic string shard declarations", () => {
  const fixture = mutate((workflow) => {
    workflow.jobs.test.strategy.matrix = '${{ fromJSON(\'{"shard":[1, 2, 3, 4]}\') }}';
  });
  assert.doesNotThrow(() => validateCiContract(fixture, "fixture"));
});

test("handles malformed shard declarations in bounded time", { timeout: 7_000 }, () => {
  const fixture = mutate((workflow) => {
    workflow.jobs.test.env = {
      ...workflow.jobs.test.env,
      INVALID_SHARDS: pathologicalShardShapes.join("\n"),
    };
  });
  const result = validateInChild(fixture);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `unexpected child signal: ${result.signal}`);
  assert.equal(result.status, 0, result.stderr);
  const { elapsedMs } = JSON.parse(result.stdout);
  assert.ok(elapsedMs < 2_000, `validator took ${elapsedMs.toFixed(1)} ms`);
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
  assert.ok(commands.includes("npm run ci:release-checks"));
  assert.match(packageManifest.scripts["ci:release-checks"], /npm run security:sast/);
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
