import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { waitForUsableService } from "./harness-readiness.mjs";

const suffix = `${process.pid}-${Date.now().toString(36)}`;
const prefix = `alerts-remediation-test-${suffix}`;
const postgresContainer = `${prefix}-postgres`;
const postgresPassword = randomBytes(24).toString("base64url");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      signal: options.signal,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.reject === false) {
        resolve(options.capture ? stdout.trim() : code ?? 0);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}\n${stderr}`));
    });
  });
}

async function waitForPostgres() {
  await waitForUsableService("Alert remediation Postgres", async (signal) => {
    const code = await run(
      "docker",
      [
        "exec",
        postgresContainer,
        "psql",
        "-U",
        "bisibility",
        "-d",
        "bisibility",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        "SELECT 1",
      ],
      { reject: false, signal },
    );
    return code === 0;
  });
}

async function mappedPort() {
  const output = await run(
    "docker",
    ["port", postgresContainer, "5432/tcp"],
    { capture: true },
  );
  const match = /:(\d+)\s*$/m.exec(output);
  if (!match) throw new Error(`Could not determine the Postgres host port from: ${output}`);
  return match[1];
}

try {
  await run("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    postgresContainer,
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=1g",
    "-e",
    "POSTGRES_DB=bisibility",
    "-e",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "-e",
    "POSTGRES_USER=bisibility",
    "-p",
    "127.0.0.1::5432",
    "postgres:16",
  ]);
  await waitForPostgres();
  const port = await mappedPort();
  const databaseUrl = `postgresql://bisibility:${postgresPassword}@127.0.0.1:${port}/bisibility?schema=public`;
  const env = {
    ALERTS_REMEDIATION_FIXTURE_PREFIX: prefix,
    DATABASE_URL: databaseUrl,
    DEPLOYMENT_ENV: "test",
    DIRECT_URL: databaseUrl,
    NOTIFICATION_TRANSPORT: "polling",
  };
  await run("npm", ["run", "db:migrate"], { env });
  await run(
    "node",
    [
      "--experimental-transform-types",
      "--import",
      "./lib/temporal/register-loader.mjs",
      "scripts/smoke/alerts-remediation.ts",
    ],
    { env },
  );
} finally {
  await run("docker", ["rm", "-f", postgresContainer], {
    reject: false,
  });
}
