import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const container = `bisibility-throughput-${process.pid}-${Date.now()}`;
const password = "throughput-harness";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`,
    );
  }
  return result.stdout?.trim() ?? "";
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], {
      stdio: "ignore",
    });
    if (ready.status === 0) return;
    await wait(500);
  }
  throw new Error("PostgreSQL 16 did not become ready.");
}

async function main() {
  run("docker", [
    "run",
    "--rm",
    "--detach",
    "--name",
    container,
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "--publish",
    "127.0.0.1::5432",
    "postgres:16",
  ]);
  await waitForPostgres();
  const portOutput = run("docker", ["port", container, "5432/tcp"], { capture: true });
  const port = portOutput.match(/:(\d+)$/)?.[1];
  if (!port) throw new Error(`Could not resolve PostgreSQL host port from ${portOutput}`);
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  const env = {
    ...process.env,
    BISIBILITY_SMOKE_REAL_NEXT_SERVER: "1",
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  };

  run("npx", ["prisma", "migrate", "deploy"], { env });
  const runner = spawn(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "scripts/smoke/resource-limits-postgres-runner.ts",
    ],
    { env, stdio: "inherit" },
  );
  const status = await new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("exit", (code) => resolve(code));
  });
  if (status !== 0) throw new Error(`PostgreSQL throughput runner exited with ${status}`);
}

try {
  await main();
} finally {
  spawnSync("docker", ["stop", container], { stdio: "ignore" });
  spawnSync("docker", ["rm", "--force", container], { stdio: "ignore" });
  const remaining = spawnSync(
    "docker",
    ["ps", "-a", "--filter", `name=^/${container}$`, "--format", "{{.Names}}"],
    { encoding: "utf8" },
  );
  if (remaining.status !== 0 || remaining.stdout.trim()) {
    throw new Error(`PostgreSQL harness left container ${container}`);
  }
}
