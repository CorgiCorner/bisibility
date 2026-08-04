#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const canonicalScripts = {
  build: ["ci:build"],
  coverage: ["ci:coverage:merge"],
  postgres: ["ci:postgres-migration-contract"],
  static: ["ci:static", "ci:release-checks"],
  test: ["ci:test:coverage-shard", "ci:release-unit-shard"],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function needs(job) {
  if (typeof job?.needs === "string") return [job.needs];
  return Array.isArray(job?.needs) ? [...new Set(job.needs)] : [];
}

function commands(job) {
  return Array.isArray(job?.steps)
    ? job.steps.flatMap((step) => (typeof step?.run === "string" ? [step.run] : []))
    : [];
}

function invokes(command, script) {
  const invocations = command.matchAll(
    /(?:^|[;&|\n]\s*)npm\s+run\s+([A-Za-z0-9:_-]+)(?=\s|[;&|]|$)/g,
  );
  return [...invocations].some((match) => match[1] === script);
}

function jobsInvoking(jobs, scripts) {
  return Object.entries(jobs)
    .filter(([, job]) =>
      commands(job).some((command) => scripts.some((script) => invokes(command, script))),
    )
    .map(([name]) => name);
}

function dependencyClosure(jobs, rootName) {
  const closure = new Set();
  const pending = [...needs(jobs[rootName])];
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || closure.has(name)) continue;
    assert(jobs[name], `${rootName} depends on missing job ${name}`);
    closure.add(name);
    pending.push(...needs(jobs[name]));
  }
  return closure;
}

function numericArrays(value, found = []) {
  if (Array.isArray(value)) {
    if (value.every((item) => Number.isInteger(item))) found.push(value);
    for (const item of value) numericArrays(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) numericArrays(item, found);
    return found;
  }
  if (typeof value === "string") {
    for (const match of value.matchAll(/\[\s*\d[\d\s,]*\]/g)) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.every((item) => Number.isInteger(item))) {
          found.push(parsed);
        }
      } catch {
        // A non-JSON bracket expression is not a shard declaration.
      }
    }
  }
  return found;
}

function hasFourShards(job) {
  const declarations = numericArrays({
    env: job?.env,
    matrix: job?.strategy?.matrix,
    runs: commands(job),
  });
  return declarations.some((items) => [1, 2, 3, 4].every((shard) => items.includes(shard)));
}

export function validateCiContract(source, label = ".github/workflows/ci.yml") {
  const workflow = parse(source);
  const jobs = workflow?.jobs;
  assert(jobs && typeof jobs === "object", `${label}: jobs must be a mapping`);

  const gate = jobs["ci-ok"];
  assert(gate, `${label}: ci-ok job is required`);
  assert(String(gate.if ?? "").includes("always()"), `${label}: ci-ok must run with always()`);
  const closure = dependencyClosure(jobs, "ci-ok");

  const gateSteps = gate.steps ?? [];
  const verificationIndex = gateSteps.findIndex(
    (step) =>
      typeof step?.run === "string" &&
      step.run.includes("node scripts/ci/verify-required-jobs.mjs"),
  );
  const verificationSteps = gateSteps.filter(
    (step) =>
      typeof step?.run === "string" &&
      step.run.includes("node scripts/ci/verify-required-jobs.mjs"),
  );
  assert(
    verificationSteps.length === 1,
    `${label}: ci-ok must invoke verify-required-jobs.mjs exactly once`,
  );
  const checkoutIndex = gateSteps.findIndex(
    (step) => typeof step?.uses === "string" && step.uses.startsWith("actions/checkout@"),
  );
  assert(
    checkoutIndex >= 0 && checkoutIndex < verificationIndex,
    `${label}: ci-ok must check out the repository before invoking the verifier`,
  );
  assert(
    verificationSteps[0]?.env?.NEEDS_JSON === "${{ toJSON(needs) }}",
    `${label}: ci-ok must pass the complete needs object as NEEDS_JSON`,
  );

  const postgresJobs = jobsInvoking(jobs, canonicalScripts.postgres);
  assert(postgresJobs.length > 0, `${label}: PostgreSQL migration contract job is required`);
  for (const jobName of postgresJobs) {
    assert(
      closure.has(jobName),
      `${label}: PostgreSQL migration contract job ${jobName} must reach ci-ok`,
    );
  }

  for (const [kind, scripts] of Object.entries(canonicalScripts)) {
    const matchingJobs = jobsInvoking(jobs, scripts);
    assert(
      matchingJobs.length > 0,
      `${label}: canonical ${kind} script (${scripts.join(" or ")}) is required`,
    );
    assert(
      matchingJobs.some((jobName) => closure.has(jobName)),
      `${label}: canonical ${kind} script (${scripts.join(" or ")}) must reach ci-ok`,
    );
  }

  const testJobs = jobsInvoking(jobs, canonicalScripts.test);
  assert(
    testJobs.some((jobName) => hasFourShards(jobs[jobName])),
    `${label}: coverage tests must declare shards 1 through 4`,
  );

  return { closure: [...closure].sort(), postgresJobs: postgresJobs.sort() };
}

function main() {
  const filename = process.argv[2] ?? ".github/workflows/ci.yml";
  validateCiContract(readFileSync(filename, "utf8"), filename);
  console.log(`CI contract is valid: ${filename}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
