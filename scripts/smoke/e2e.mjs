import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDockerVmFreeSpace } from "./docker-ephemeral.mjs";
import { waitForUsableService } from "./harness-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = Number(process.env.E2E_PORT ?? 3100);
const baseUrl = `http://127.0.0.1:${port}`;
const composeArgs = [
  "compose",
  "-f",
  "docker-compose.yml",
  "-f",
  "docker-compose.debug.yml",
  "-p",
  "bisibility-e2e",
];
const postgresHostPort = process.env.POSTGRES_HOST_PORT || "5432";
const postgresPassword = randomBytes(24).toString("base64url");
const pgUrl = `postgresql://bisibility:${postgresPassword}@127.0.0.1:${postgresHostPort}/bisibility?schema=bisibility_e2e`;
const authSecret = randomBytes(32).toString("base64url");
const secretKey = randomBytes(32).toString("base64");
const reportDir = path.join(root, "reports/e2e");
const otpFile = path.join(reportDir, "otp.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  const stdio = options.stdio ?? "inherit";
  const env = { ...process.env, ...options.env };

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, signal: options.signal, stdio });
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

async function waitForPostgres() {
  await waitForUsableService("E2E Postgres", async (signal) => {
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
      { env: testEnv, reject: false, signal, stdio: "ignore" },
    );
    return code === 0;
  });
}

async function waitForHttp(url) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`${url} did not become ready.`);
}

async function warmDevelopmentRoutes() {
  const paths = ["/login", "/onboarding", "/app/prj_e2e_warmup/dashboard"];

  for (const routePath of paths) {
    const response = await fetch(new URL(routePath, baseUrl), { redirect: "manual" });
    await response.arrayBuffer();
    if (response.status >= 500) {
      throw new Error(`E2E route warmup failed for ${routePath}: HTTP ${response.status}`);
    }
  }
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
      if (!match) {
        continue;
      }
      otps.set(match[1].toLowerCase(), match[2]);
      await fs.writeFile(otpFile, JSON.stringify(Object.fromEntries(otps), null, 2));
    }
  }

  child.stdout?.on("data", (chunk) => void capture(chunk));
  child.stderr?.on("data", (chunk) => void capture(chunk));
}

async function stopServer(server) {
  if (!server || server.killed) {
    return;
  }
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    sleep(5_000).then(() => server.kill("SIGKILL")),
  ]);
}

const cleanupScript = `
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";

const moduleUrl = (relativePath) => pathToFileURL(path.join(process.cwd(), relativePath)).href;
const { databaseConnectionConfig, databaseSchemaFromUrl } = await import(
  moduleUrl("lib/db/pool-config.ts")
);
const { withPublicIdWrites } = await import(moduleUrl("lib/db/public-id-writes.ts"));
const { PrismaClient } = await import(moduleUrl("lib/generated/prisma/client.ts"));

const datasourceUrl = process.env.DATABASE_URL;
const prisma = withPublicIdWrites(new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: datasourceUrl, ...databaseConnectionConfig(datasourceUrl), max: 1 },
    { schema: databaseSchemaFromUrl(datasourceUrl) },
  ),
}));
const verifications = await prisma.verification.deleteMany({
  where: { identifier: { startsWith: "e2e-", endsWith: "@example.com" } },
});
const users = await prisma.user.findMany({
  select: {
    id: true,
    projects: { select: { id: true } },
  },
  where: { email: { startsWith: "e2e-", endsWith: "@example.com" } },
});

if (users.length === 0) {
  console.log(
    "[e2e] Removed 0 test users and " + verifications.count + " verification rows.",
  );
  await prisma.$disconnect();
  process.exit(0);
}

const userIds = users.map((user) => user.id);
const projectIds = users.flatMap((user) => user.projects.map((project) => project.id));
const auditFilters = [{ actorId: { in: userIds } }];

if (projectIds.length > 0) {
  auditFilters.push({ projectId: { in: projectIds } });
}

const audits = await prisma.auditLog.deleteMany({ where: { OR: auditFilters } });
const deleted = await prisma.user.deleteMany({ where: { id: { in: userIds } } });

console.log(
  "[e2e] Removed " +
    deleted.count +
    " test users, " +
    audits.count +
    " audit rows, and " +
    verifications.count +
    " verification rows.",
);

await prisma.$disconnect();
`;

async function cleanupE2eUsers() {
  await run("node", ["--experimental-strip-types", "--input-type=module", "-e", cleanupScript], {
    env: testEnv,
  });
}

const testEnv = {
  BETTER_AUTH_SECRET: authSecret,
  BETTER_AUTH_URL: baseUrl,
  BISIBILITY_FAKE_PROVIDER: "1",
  BISIBILITY_SECRETS_KEY: secretKey,
  CORGICORNER_EPHEMERAL: "1",
  DATABASE_URL: pgUrl,
  DEPLOYMENT_ENV: "test",
  DIRECT_URL: pgUrl,
  POSTGRES_PASSWORD: postgresPassword,
  POSTGRES_HOST_PORT: postgresHostPort,
  SITE_URL: baseUrl,
};
const serverEnv = {
  ...testEnv,
  DATABASE_URL: pgUrl,
  DIRECT_URL: pgUrl,
  NODE_ENV: "development",
  PORT: String(port),
};

let server;
let exitCode = 0;

try {
  ensureDockerVmFreeSpace({ profile: "runtime" });
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(otpFile, "{}");
  await run("docker", [...composeArgs, "down", "--volumes", "--remove-orphans"], {
    env: testEnv,
  });
  await run("docker", [...composeArgs, "up", "-d", "--wait", "postgres"], { env: testEnv });
  await waitForPostgres();
  await run("npm", ["run", "db:migrate"], { env: testEnv });
  await run("npm", ["run", "db:seed"], { env: testEnv });

  // Run the dev server so OTP codes appear in the log (no mailer in dev). `next start`
  // would force NODE_ENV=production, which refuses to log the code.
  server = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, ...serverEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  wireOtpCapture(server);
  await waitForHttp(baseUrl);
  await warmDevelopmentRoutes();
  await run("npx", ["playwright", "test"], {
    env: { ...serverEnv, BISIBILITY_E2E_OTP_FILE: otpFile, E2E_BASE_URL: baseUrl },
  });
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await stopServer(server);
  try {
    await cleanupE2eUsers();
  } catch (error) {
    console.error(error);
    exitCode = 1;
  }
  await run("docker", [...composeArgs, "down", "--volumes", "--rmi", "local", "--remove-orphans"], {
    env: testEnv,
    reject: false,
  });
}

process.exit(exitCode);
