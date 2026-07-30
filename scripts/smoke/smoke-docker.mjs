import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { waitForUsableService } from "./harness-readiness.mjs";

const suffix = `${process.pid}-${Date.now().toString(36)}`;
const projectName = `bisibility-smoke-${suffix}`;
const network = `${projectName}_default`;
const postgresName = `bisibility-smoke-postgres-${suffix}`;
const migrateName = `bisibility-smoke-migrate-${suffix}`;
const releaseMigrateName = `bisibility-smoke-release-migrate-${suffix}`;
const appName = `bisibility-smoke-app-${suffix}`;
const image = "bisibility:smoke";
const migrateImage = "bisibility:migrate-smoke";
const postgresPassword = randomBytes(24).toString("base64url");
const authSecret = randomBytes(32).toString("base64url");
const secretKey = randomBytes(32).toString("base64");
const containerPgUrl =
  `postgresql://bisibility:${postgresPassword}@postgres:5432/bisibility?schema=public`;
let appPort = "";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      signal: options.signal,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : (options.stdio ?? "inherit"),
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
  await waitForUsableService("Docker smoke Postgres", async (signal) => {
    const code = await run(
      "docker",
      [
        "exec",
        postgresName,
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
      { reject: false, signal, stdio: "ignore" },
    );
    return code === 0;
  });
}

async function waitForApp() {
  const url = `http://127.0.0.1:${appPort}/robots.txt`;
  const deadline = Date.now() + 90_000;
  let lastResponse = "no response";
  while (Date.now() < deadline) {
    lastResponse = await run(
      "curl",
      ["--silent", "--show-error", "--max-time", "5", "--output", "/dev/null", "--write-out", "%{http_code}", url],
      { capture: true, reject: false },
    );
    if (lastResponse === "200") {
      console.log(`GET ${url} 200`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`GET ${url} did not return 200 (last response: ${lastResponse}).`);
}

async function expectPublicRoute(route) {
  const url = `http://127.0.0.1:${appPort}${route}`;
  const status = await run(
    "curl",
    ["--silent", "--show-error", "--max-time", "10", "--output", "/dev/null", "--write-out", "%{http_code}", url],
    { capture: true, reject: false },
  );
  if (status !== "200") {
    throw new Error(`GET ${url} did not return 200 (response: ${status}).`);
  }
  console.log(`GET ${url} 200`);
}

async function mappedPort(container, containerPort) {
  return run(
    "docker",
    [
      "inspect",
      "--format",
      `{{(index (index .NetworkSettings.Ports "${containerPort}/tcp") 0).HostPort}}`,
      container,
    ],
    { capture: true },
  );
}

try {
  if (process.env.BISIBILITY_SMOKE_SKIP_BUILD !== "1") {
    await run("docker", ["build", "--target", "migrate", "-t", migrateImage, "."]);
    await run("docker", ["build", "-t", image, "."]);
  }
  await run("docker", ["network", "create", network]);
  await run("docker", [
    "run",
    "--rm",
    "-d",
    "--name",
    postgresName,
    "--network",
    network,
    "--network-alias",
    "postgres",
    "--tmpfs",
    "/var/lib/postgresql/data:rw,size=1g",
    "-e",
    "POSTGRES_DB=bisibility",
    "-e",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "-e",
    "POSTGRES_USER=bisibility",
    "postgres:16",
  ]);
  await waitForPostgres();
  await run("docker", [
    "run",
    "--name",
    releaseMigrateName,
    "--network",
    network,
    "-e",
    `DATABASE_URL=${containerPgUrl}`,
    "-e",
    `DIRECT_URL=${containerPgUrl}`,
    "-e",
    "DEPLOYMENT_ENV=test",
    image,
    "npm",
    "run",
    "db:migrate",
  ]);
  await run("docker", [
    "run",
    "--name",
    migrateName,
    "--network",
    network,
    "-e",
    `DATABASE_URL=${containerPgUrl}`,
    "-e",
    `DIRECT_URL=${containerPgUrl}`,
    "-e",
    "DEPLOYMENT_ENV=test",
    migrateImage,
  ]);
  await run("docker", [
    "run",
    "-d",
    "--name",
    appName,
    "--network",
    network,
    "--network-alias",
    "bisibility-smoke-app",
    "-p",
    "127.0.0.1::3000",
    "-e",
    `DATABASE_URL=${containerPgUrl}`,
    "-e",
    `DIRECT_URL=${containerPgUrl}`,
    "-e",
    `BETTER_AUTH_SECRET=${authSecret}`,
    "-e",
    `BISIBILITY_SECRETS_KEY=${secretKey}`,
    "-e",
    "BETTER_AUTH_URL=http://127.0.0.1:3000",
    "-e",
    "SITE_URL=http://127.0.0.1:3000",
    image,
  ]);
  appPort = await mappedPort(appName, "3000");
  await waitForApp();
  await expectPublicRoute("/");
  await expectPublicRoute("/login");
} catch (error) {
  await run("docker", ["logs", migrateName], { reject: false });
  await run("docker", ["logs", appName], { reject: false });
  throw error;
} finally {
  await run("docker", [
    "rm",
    "-f",
    appName,
    migrateName,
    releaseMigrateName,
    postgresName,
  ], {
    reject: false,
    stdio: "ignore",
  });
  await run("docker", ["network", "rm", network], {
    reject: false,
    stdio: "ignore",
  });
}
