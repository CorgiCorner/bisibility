#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ensureDockerVmFreeSpace } from "./docker-ephemeral.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "bisibility-temporal-upgrade-"));
const oldCompose = path.join(temporaryRoot, "docker-compose.old.yml");
const newCompose = path.join(root, "docker-compose.temporal.yml");
const project = `bisibility-temporal-upgrade-${process.pid}`;

writeFileSync(
  oldCompose,
  `services:
  temporal-postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: temporal
      POSTGRES_PASSWORD: temporal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U temporal -d temporal"]
      interval: 2s
      timeout: 2s
      retries: 30
    volumes:
      - temporal-dev-postgres-data:/var/lib/postgresql/data
  temporal:
    image: temporalio/auto-setup:1.25.2
    depends_on:
      temporal-postgres:
        condition: service_healthy
    environment:
      DB: postgres12
      DB_PORT: 5432
      POSTGRES_USER: temporal
      POSTGRES_PWD: temporal
      POSTGRES_SEEDS: temporal-postgres
volumes:
  temporal-dev-postgres-data:
`,
);

function run(args, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    const detail = result.error?.message ?? result.stderr ?? `exit ${result.status}`;
    throw new Error(`docker ${args.join(" ")} failed: ${detail}`);
  }
  return result;
}

function compose(file, args, options) {
  return run(["compose", "-p", project, "-f", file, ...args], options);
}

function eventually(label, callback, attempts = 90) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = callback();
    if (result.status === 0) return;
    if (attempt === attempts) {
      throw new Error(`${label} did not become ready: ${result.stderr || result.stdout}`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
  }
}

try {
  ensureDockerVmFreeSpace({ profile: "runtime" });
  console.log("Starting the v0.2.0 Temporal 1.25.2 baseline...");
  compose(oldCompose, ["up", "-d", "temporal"]);
  eventually("Temporal 1.25.2", () =>
    compose(
      oldCompose,
      ["exec", "-T", "temporal", "tctl", "--address", "temporal:7233", "cluster", "health"],
      { allowFailure: true, quiet: true },
    ),
  );

  console.log("Applying the 1.31.2 schema and server topology to the same database...");
  compose(oldCompose, ["stop", "temporal"]);
  compose(newCompose, ["up", "-d", "temporal-namespace"]);
  eventually("Temporal 1.31.2 namespace setup", () => {
    const result = compose(
      newCompose,
      ["ps", "-a", "--format", "json", "temporal-namespace"],
      { allowFailure: true, quiet: true },
    );
    if (result.status !== 0) return result;
    try {
      const parsed = JSON.parse(result.stdout.trim());
      const row = Array.isArray(parsed) ? parsed[0] : parsed;
      return { ...result, status: row.State === "exited" && row.ExitCode === 0 ? 0 : 1 };
    } catch {
      return { ...result, status: 1 };
    }
  });

  const runningImage = compose(
    newCompose,
    ["images", "--format", "json", "temporal"],
    { quiet: true },
  );
  if (!runningImage.stdout.includes("temporalio/server") || !runningImage.stdout.includes("1.31.2")) {
    throw new Error(`Unexpected Temporal image after upgrade: ${runningImage.stdout}`);
  }
  compose(newCompose, ["run", "--rm", "--no-deps", "--entrypoint", "temporal", "temporal-namespace", "operator", "cluster", "health", "--address", "temporal:7233"]);
  compose(newCompose, ["run", "--rm", "--no-deps", "--entrypoint", "temporal", "temporal-namespace", "operator", "namespace", "describe", "--address", "temporal:7233", "--namespace", "default"]);
  console.log("Temporal upgrade smoke passed: 1.25.2 data is served by 1.31.2.");
} catch (error) {
  compose(
    newCompose,
    ["logs", "--no-color", "temporal-schema", "temporal", "temporal-namespace"],
    { allowFailure: true },
  );
  throw error;
} finally {
  compose(newCompose, ["down", "-v", "--rmi", "local", "--remove-orphans"], { allowFailure: true });
  rmSync(temporaryRoot, { force: true, recursive: true });
}
