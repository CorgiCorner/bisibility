import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForUsableService } from "./harness-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.FIRST_RUN_E2E_PORT ?? 3110);
const postgresHostPort = process.env.FIRST_RUN_POSTGRES_PORT ?? "55447";
const baseUrl = `http://127.0.0.1:${port}`;
const composeArgs = ["compose", "-p", "bisibility-first-run-schema-e2e"];
const postgresPassword = randomBytes(24).toString("base64url");
const databaseUrl =
  `postgresql://bisibility:${postgresPassword}@127.0.0.1:${postgresHostPort}` +
  "/bisibility?schema=bisibility_first_run_e2e";
const reportDir = path.join(root, "reports/e2e");
const otpFile = path.join(reportDir, "first-run-otp.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  const env = { ...process.env, ...options.env };
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      signal: options.signal,
      stdio: options.stdio ?? "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.reject === false) {
        resolve(code ?? 0);
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function waitForPostgres(env) {
  await waitForUsableService("First-run schema Postgres", async (signal) => {
    const code = await run(
      "docker",
      [
        ...composeArgs,
        "exec",
        "-T",
        "postgres",
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
      { env, reject: false, signal, stdio: "ignore" },
    );
    return code === 0;
  });
}

async function waitForHttp() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/setup`);
      if (response.ok) return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`${baseUrl}/setup did not become ready.`);
}

function wireOtpCapture(child) {
  const otps = new Map();
  let buffer = "";

  async function capture(chunk) {
    process.stdout.write(chunk);
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const match = /\[auth\]\s+sign-in OTP for ([^:]+):\s*(\d{6})/.exec(line);
      if (!match) continue;
      otps.set(match[1].toLowerCase(), match[2]);
      await fs.writeFile(otpFile, JSON.stringify(Object.fromEntries(otps), null, 2));
    }
  }

  child.stdout?.on("data", (chunk) => void capture(chunk));
  child.stderr?.on("data", (chunk) => void capture(chunk));
}

async function stopServer(server) {
  if (!server || server.killed) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    sleep(5_000).then(() => server.kill("SIGKILL")),
  ]);
}

const testEnv = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  BETTER_AUTH_URL: baseUrl,
  BISIBILITY_FIRST_RUN_SCHEMA_E2E: "1",
  BISIBILITY_SECRETS_KEY: randomBytes(32).toString("base64"),
  DATABASE_URL: databaseUrl,
  DEPLOYMENT_MODE: "self-host",
  DIRECT_URL: databaseUrl,
  E2E_BASE_URL: baseUrl,
  POSTGRES_HOST_PORT: postgresHostPort,
  POSTGRES_PASSWORD: postgresPassword,
  SITE_URL: baseUrl,
};

let server;
let exitCode = 0;

try {
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(otpFile, "{}");
  await run("docker", [...composeArgs, "up", "-d", "--wait", "postgres"], { env: testEnv });
  await waitForPostgres(testEnv);
  await run("npx", ["prisma", "migrate", "deploy"], { env: testEnv });
  await run("npm", ["run", "build"], { env: testEnv });

  server = spawn("npm", ["run", "start", "--", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, ...testEnv, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  wireOtpCapture(server);
  await waitForHttp();
  await run("npx", ["playwright", "test", "e2e/first-run-schema.spec.ts"], {
    env: { ...testEnv, BISIBILITY_E2E_OTP_FILE: otpFile },
  });
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await stopServer(server);
  await run("docker", [...composeArgs, "down", "--volumes", "--remove-orphans"], {
    env: testEnv,
    reject: false,
  });
}

process.exit(exitCode);
