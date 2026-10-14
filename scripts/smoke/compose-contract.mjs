#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workflowProbe } from "./compose-workflow-probe.mjs";
import { ensureDockerVmFreeSpace, reclaimDockerBuildCache } from "./docker-ephemeral.mjs";

const project = `bisibility-compose-contract-${process.pid}`;
const temporaryRoot = mkdtempSync(join(tmpdir(), "bisibility-compose-contract-"));
const noHostPortsCompose = join(temporaryRoot, "compose.no-host-ports.yaml");
const fullRuntime = process.argv.slice(2).includes("--full");
const buildsImages = fullRuntime && process.env.BISIBILITY_COMPOSE_E2E_SKIP_BUILD !== "1";
const reclaimsBuildCache =
  buildsImages && process.env.BISIBILITY_COMPOSE_E2E_RECLAIM_BUILD_CACHE === "1";
const files = [
  "compose.yaml",
  "compose.worker.yaml",
  "compose.temporal.yaml",
  ...(fullRuntime ? ["compose.build.yaml"] : []),
  noHostPortsCompose,
];
const baseArgs = ["compose", "-p", project, ...files.flatMap((file) => ["-f", file])];
const workerContainer = `${project}-worker-e2e`;
const appImage = process.env.BISIBILITY_COMPOSE_E2E_APP_IMAGE ?? `${project}-app:local`;
const workerImage =
  process.env.BISIBILITY_COMPOSE_E2E_WORKER_IMAGE ?? `${project}-worker:local`;
const env = {
  ...process.env,
  BETTER_AUTH_SECRET: "compose-contract-auth-secret",
  BETTER_AUTH_URL: "https://example.com",
  BISIBILITY_DEPLOYMENT_SUFFIX: "contract",
  BISIBILITY_IMAGE: appImage,
  BISIBILITY_PULL_POLICY: "never",
  CORGICORNER_EPHEMERAL: "1",
  BISIBILITY_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64"),
  BISIBILITY_SECRETS_KEYS_RETIRED: "",
  BISIBILITY_WORKER_IMAGE: workerImage,
  DATABASE_URL: "postgresql://bisibility:contract@postgres:5432/bisibility",
  DEMO_FIXED_OTP: "1",
  DEMO_INSTANCE_INSECURE_AUTH_ACK: "1",
  DEPLOYMENT_ENV: "test",
  DIRECT_URL: "postgresql://bisibility:contract@postgres:5432/bisibility",
  POSTGRES_PASSWORD: "contract",
  SITE_URL: "https://example.com",
  TEMPORAL_POSTGRES_PASSWORD: "temporal-contract",
};


function run(args, options = {}) {
  const result = spawnSync("docker", [...baseArgs, ...args], {
    encoding: "utf8",
    env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error || (options.acceptFailure !== true && result.status !== 0)) {
    const detail = result.error?.message ?? result.stderr ?? `exit ${result.status}`;
    throw new Error(`docker ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

function reportServiceDiagnostics() {
  for (const service of ["postgres", "redis", "temporal-postgres", "temporal"]) {
    const ids = run(["ps", "-aq", service], { acceptFailure: true, capture: true });
    const id = (ids.stdout ?? "").trim().split("\n").filter(Boolean).at(-1);
    if (!id) continue;
    const state = docker(
      [
        "inspect",
        "--format",
        "status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
        id,
      ],
      { acceptFailure: true, capture: true },
    );
    console.error(`[diagnostics] ${service} ${(state.stdout ?? "").trim()}`);
    const health = docker(
      ["inspect", "--format", "{{if .State.Health}}{{json .State.Health.Log}}{{end}}", id],
      { acceptFailure: true, capture: true },
    );
    const probes = (health.stdout ?? "").trim();
    if (probes) console.error(`[diagnostics] ${service} health probes: ${probes}`);
    const logs = run(["logs", "--tail", "80", service], { acceptFailure: true, capture: true });
    const output = `${logs.stdout ?? ""}${logs.stderr ?? ""}`.trim();
    if (output) console.error(`[diagnostics] ${service} logs:\n${output}`);
  }
}

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    timeout: options.timeoutMs,
    env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error || (options.acceptFailure !== true && result.status !== 0)) {
    const detail = result.error?.message ?? `exit ${result.status}`;
    const output = [result.stdout, result.stderr].filter(Boolean).map((value) => value.slice(-16_384)).join("\n");
    throw new Error(`docker ${args.slice(0, 2).join(" ")} failed: ${detail}\n${output}`);
  }
  return result;
}

function sleep(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function waitForWorker() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const logs = docker(["logs", workerContainer], { capture: true });
    const output = `${logs.stdout}\n${logs.stderr}`;
    if (output.includes("[temporal] worker ready")) return;

    const state = docker(
      ["inspect", "--format", "{{.State.Status}}", workerContainer],
      { acceptFailure: true, capture: true },
    );
    if (state.status !== 0 || state.stdout.trim() === "exited") {
      throw new Error(`Bundled worker exited before readiness:\n${output}`);
    }
    sleep(1_000);
  }
  const logs = docker(["logs", workerContainer], { capture: true });
  throw new Error(`Bundled worker did not become ready:\n${logs.stdout}\n${logs.stderr}`);
}

try {
  writeFileSync(noHostPortsCompose, "services:\n  app:\n    ports: !reset []\n");
  ensureDockerVmFreeSpace({ environment: env, profile: buildsImages ? "build" : "runtime" });
  run(["config", "--quiet"]);
  run(["up", "-d", "temporal-postgres"]);
  run(["run", "--rm", "temporal-schema"]);
  run(["run", "--rm", "temporal-schema"]);
  run(["up", "-d", "temporal"]);
  run(["run", "--rm", "temporal-namespace"]);
  run(["run", "--rm", "temporal-namespace"]);
  const namespace = run(
    [
      "run", "--rm", "--entrypoint", "temporal", "temporal-namespace",
      "operator", "namespace", "describe",
      "--address", "temporal:7233", "--namespace", "bisibility-contract",
    ],
    { capture: true },
  );
  if (!namespace.stdout.includes("bisibility-contract")) {
    throw new Error("The deployment-scoped namespace was not observable after bootstrap.");
  }
  const searchAttributes = run(
    [
      "run", "--rm", "--entrypoint", "temporal", "temporal-namespace",
      "operator", "search-attribute", "list",
      "--address", "temporal:7233", "--namespace", "bisibility-contract",
      "--output", "json",
    ],
    { capture: true },
  );
  const provisionedAttributes = JSON.parse(searchAttributes.stdout).customAttributes ?? {};
  for (const attribute of ["keywordId", "projectId", "provider"]) {
    if (provisionedAttributes[attribute] !== "INDEXED_VALUE_TYPE_KEYWORD") {
      throw new Error(`Bundled namespace did not provision ${attribute} as Keyword.`);
    }
  }
  console.log("Compose bootstrap contract passed twice.");

  if (fullRuntime) {
    if (buildsImages && reclaimsBuildCache) {
      run(["build", "app"]);
      reclaimDockerBuildCache({ environment: env });
      run(["build", "worker"]);
      reclaimDockerBuildCache({ environment: env });
    } else if (buildsImages) {
      run(["build", "app", "worker"]);
    }
    run(["up", "-d", "--wait", "postgres", "redis"]);
    run(["run", "--rm", "db-migrations"]);
    run(["up", "-d", "app"]);
    const invalidTls = run(
      ["run", "--rm", "--env", "TEMPORAL_TLS=true", "worker"],
      { acceptFailure: true, capture: true },
    );
    const invalidTlsOutput = `${invalidTls.stdout}\n${invalidTls.stderr}`;
    if (
      invalidTls.status === 0 ||
      !invalidTlsOutput.includes("worker startup stage failed") ||
      !invalidTlsOutput.includes("tls-auth")
    ) {
      throw new Error(
        `Invalid Temporal TLS did not fail fast at the tls-auth stage:\n${invalidTlsOutput}`,
      );
    }
    console.log("Compose worker rejected invalid Temporal TLS at the tls-auth startup stage.");
    run([
      "run",
      "--detach",
      "--name",
      workerContainer,
      "--env",
      "BISIBILITY_FAKE_PROVIDER=1",
      "worker",
    ]);
    waitForWorker();
    const probe = docker(
      [
        "exec", workerContainer, "node", "--experimental-transform-types",
        "--import", "./lib/temporal/register-loader.mjs",
        "--input-type=module", "--eval", workflowProbe,
      ],
      { capture: true, timeoutMs: 120_000 },
    );
    if (!probe.stdout.includes('"status":"completed"')) {
      throw new Error(`Bundled rank-check probe returned no completed result: ${probe.stdout}`);
    }
    process.stdout.write(probe.stdout);
    console.log("Compose bundled scheduler contract completed a rank-check workflow.");
  } else {
    console.log("Compose bootstrap contract passed without repository builds.");
  }
} catch (error) {
  console.error(`Compose bootstrap contract failed: ${error.message}`);
  reportServiceDiagnostics();
  const workerLogs = docker(["logs", "--tail", "80", workerContainer], { acceptFailure: true, capture: true });
  console.error(`[diagnostics] worker logs:\n${workerLogs.stdout ?? ""}${workerLogs.stderr ?? ""}`);
  process.exitCode = 1;
} finally {
  try {
    docker(["rm", "--force", workerContainer], { acceptFailure: true, capture: true });
    spawnSync("docker", [...baseArgs, "down", "--volumes", "--rmi", "local", "--remove-orphans"], {
      env,
      stdio: "inherit",
    });
    docker(["image", "rm", "--force", appImage, workerImage], {
      acceptFailure: true,
      capture: true,
    });
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}
