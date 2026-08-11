import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { ensureDockerVmFreeSpace } from "../scripts/smoke/docker-ephemeral.mjs";

const port = Number(process.env.SMOKE_APP_PORT ?? 3100);
const url = `http://127.0.0.1:${port}/`;
const projectName = `bisibility-smoke-app-${process.pid}`;
const composeArgs = [
  "compose",
  "-f",
  "docker-compose.yml",
  "-f",
  "docker-compose.debug.yml",
  "-p",
  projectName,
];

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!address || typeof address === "string") {
    throw new Error("Could not select a PostgreSQL port for the app smoke test");
  }
  return String(address.port);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || options.reject === false) {
        resolve(code ?? 0);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}`,
        ),
      );
    });
  });
}

async function hasBuild() {
  try {
    await access(".next/BUILD_ID");
    return true;
  } catch {
    return false;
  }
}

async function waitForOk(deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`GET ${url} did not return 200`);
}

async function stopServer(server) {
  if (server.killed || server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
}

const postgresHostPort = process.env.POSTGRES_HOST_PORT || (await availablePort());
const postgresPassword = randomBytes(24).toString("base64url");
const databaseUrl = `postgresql://bisibility:${postgresPassword}@127.0.0.1:${postgresHostPort}/bisibility?schema=bisibility_smoke_app`;
const testEnv = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: url.slice(0, -1),
  BISIBILITY_SECRETS_KEY: randomBytes(32).toString("base64"),
  CORGICORNER_EPHEMERAL: "1",
  DATABASE_URL: databaseUrl,
  DEPLOYMENT_ENV: "test",
  DIRECT_URL: databaseUrl,
  POSTGRES_HOST_PORT: postgresHostPort,
  POSTGRES_PASSWORD: postgresPassword,
  SITE_URL: url.slice(0, -1),
};

try {
  ensureDockerVmFreeSpace({ profile: "runtime" });
  await run("docker", [...composeArgs, "up", "-d", "--wait", "postgres"], { env: testEnv });
  await run("npm", ["run", "db:migrate"], { env: testEnv });

  // `release:check` runs this before build; use dev without a build, otherwise start,
  // then require the public homepage to respond against the migrated scratch database.
  const command = (await hasBuild())
    ? ["run", "start", "--", "-p", String(port)]
    : ["run", "dev", "--", "-p", String(port)];
  const server = spawn("npm", command, {
    env: { ...process.env, ...testEnv, PORT: String(port) },
    stdio: "inherit",
  });

  try {
    await waitForOk(Date.now() + 60_000);
    console.log(`GET ${url} 200`);
  } finally {
    await stopServer(server);
  }
} finally {
  await run("docker", [...composeArgs, "down", "--volumes", "--rmi", "local", "--remove-orphans"], {
    env: testEnv,
    reject: false,
  });
}
