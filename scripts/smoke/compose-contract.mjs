#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const project = `bisibility-compose-contract-${process.pid}`;
const fullRuntime = process.argv.slice(2).includes("--full");
const files = [
  "compose.yaml",
  "compose.worker.yaml",
  "compose.temporal.yaml",
  ...(fullRuntime ? ["compose.build.yaml"] : []),
];
const baseArgs = ["compose", "-p", project, ...files.flatMap((file) => ["-f", file])];
const workerContainer = `${project}-worker-e2e`;
const appImage = process.env.BISIBILITY_COMPOSE_E2E_APP_IMAGE ?? `${project}-app:local`;
const workerImage =
  process.env.BISIBILITY_COMPOSE_E2E_WORKER_IMAGE ?? `${project}-worker:local`;
const env = {
  ...process.env,
  APP_HOST_PORT: String(20_000 + (process.pid % 20_000)),
  BETTER_AUTH_SECRET: "compose-contract-auth-secret",
  BETTER_AUTH_URL: "https://example.com",
  BISIBILITY_DEPLOYMENT_SUFFIX: "contract",
  BISIBILITY_IMAGE: appImage,
  BISIBILITY_PULL_POLICY: "never",
  BISIBILITY_SECRETS_KEY: "compose-contract-secrets-key",
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

const workflowProbe = `
const { prisma } = await import("file:///app/lib/db/prisma.ts");
const { closeTemporalClient, getTemporalClient, startRankCheckWorkflow } = await import(
  "file:///app/lib/temporal/client.ts"
);

try {
  const keyword = await prisma.keyword.findFirst({ orderBy: { createdAt: "asc" } });
  if (!keyword) throw new Error("Demo seed did not create a keyword.");
  const started = await startRankCheckWorkflow({
    keywordId: keyword.id,
    providerId: "dataforseo",
  });
  const client = await getTemporalClient();
  const result = await client.workflow.getHandle(started.workflowId, started.runId).result();
  if (result.deferred) throw new Error("Rank-check workflow was deferred: " + result.reason);
  const rankCheck = await prisma.rankCheck.findUnique({ where: { id: result.rankCheckId } });
  if (!rankCheck || rankCheck.status !== "completed") {
    throw new Error("Rank-check workflow did not persist a completed result.");
  }
  console.log(
    JSON.stringify({
      keywordId: keyword.id,
      rankCheckId: rankCheck.id,
      status: rankCheck.status,
      workflowId: started.workflowId,
    }),
  );
} finally {
  await closeTemporalClient();
  await prisma.$disconnect();
}
`;

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

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
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
  run(["config", "--quiet"]);
  run(["up", "-d", "temporal-postgres"]);
  run(["run", "--rm", "temporal-schema"]);
  run(["run", "--rm", "temporal-schema"]);
  run(["up", "-d", "temporal"]);
  run(["run", "--rm", "temporal-namespace"]);
  run(["run", "--rm", "temporal-namespace"]);
  const namespace = run(
    [
      "run",
      "--rm",
      "--entrypoint",
      "temporal",
      "temporal-namespace",
      "operator",
      "namespace",
      "describe",
      "--address",
      "temporal:7233",
      "--namespace",
      "bisibility-contract",
    ],
    { capture: true },
  );
  if (!namespace.stdout.includes("bisibility-contract")) {
    throw new Error("The deployment-scoped namespace was not observable after bootstrap.");
  }
  console.log("Compose bootstrap contract passed twice.");

  if (fullRuntime) {
    if (process.env.BISIBILITY_COMPOSE_E2E_SKIP_BUILD !== "1") {
      run(["build", "app", "worker"]);
    }
    run(["up", "-d", "postgres", "redis"]);
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
        "exec",
        workerContainer,
        "node",
        "--experimental-transform-types",
        "--import",
        "./lib/temporal/register-loader.mjs",
        "--input-type=module",
        "--eval",
        workflowProbe,
      ],
      { capture: true },
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
  process.exitCode = 1;
} finally {
  docker(["rm", "--force", workerContainer], { acceptFailure: true, capture: true });
  spawnSync("docker", [...baseArgs, "down", "--volumes", "--remove-orphans"], {
    env,
    stdio: "inherit",
  });
}
