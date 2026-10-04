#!/usr/bin/env node

/**
 * Captures the seeded dashboard from an isolated PostgreSQL schema.
 *
 * Run from the repository root:
 * DATABASE_URL='postgresql://user:password@host:5432/database' npm run screenshot:dashboard
 *
 * The supplied connection must be allowed to create and drop schemas. The script never migrates
 * or seeds the URL's configured schema; it creates a random disposable schema and removes it.
 *
 * A throwaway `postgres:16` container with a random superuser password is the least surprising
 * source for that connection: nothing the run does can then reach a database anyone else is using.
 * Remove the container afterwards.
 *
 * The application is built and served in production mode, so the capture shows what a user sees.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captureDashboard } from "./dashboard-screenshot-browser.mjs";
import { prepareScreenshotFixtures } from "./dashboard-screenshot-fixtures.mjs";
import {
  createScreenshotSchema,
  dropScreenshotSchema,
  isolatedDatabaseUrl,
  requiredDatabaseUrl,
  screenshotSchemaName,
  seededDemoProjectRef,
} from "./dashboard-screenshot-database.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const host = "127.0.0.1";
const outputPath = path.join(root, "public/screenshots/dashboard-overview.png");

function runCommand(command, args, env) {
  console.log(`> ${command} ${args.join(" ")}`);
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed ${signal ? `with signal ${signal}` : `with exit ${code}`}.`,
        ),
      );
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address !== "object") {
          reject(new Error("Could not allocate a local port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function waitForHttp(url, child) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 90_000;
    let settled = false;

    function retry() {
      if (settled) return;
      if (Date.now() > deadline) {
        settled = true;
        reject(new Error(`Timed out waiting for ${url}.`));
        return;
      }
      setTimeout(probe, 750);
    }

    function probe() {
      if (settled) return;
      if (child.exitCode !== null) {
        settled = true;
        reject(new Error(`Next dev server exited with code ${child.exitCode}.`));
        return;
      }

      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode ?? 0) < 500) {
          settled = true;
          resolve();
          return;
        }
        retry();
      });
      request.on("error", retry);
      request.setTimeout(10_000, () => {
        request.destroy();
        retry();
      });
    }

    probe();
  });
}

function startNext(port, env) {
  // `next start`, never `next dev`. The README leads with this image, and the development server
  // paints its own tooling into the corner of the viewport - the indicator landed on top of the
  // workspace avatar in the first capture. A production server also renders what a user actually
  // gets: minified output, no development overlays, no fast-refresh instrumentation.
  return spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      host,
      "--port",
      String(port),
    ],
    {
      cwd: root,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 5_000);
    function finish() {
      clearTimeout(forceTimer);
      resolve();
    }
    child.once("exit", finish);
    child.kill("SIGTERM");
    if (child.exitCode !== null) finish();
  });
}

const bakedRuntimeEnvPath = path.join(root, "lib/deployment/runtime-env.generated.ts");

/**
 * `npm run build` bakes the environment it was given into a generated module. Ours points at a
 * throwaway container and a random port, and the unit suite reads that module - a run used to
 * leave the agent-ready discovery tests failing against `http://127.0.0.1:<port>` until
 * someone re-baked by hand. Restore whatever was there before, so generating an image cannot
 * change the outcome of anyone's tests.
 */
async function withPreservedBakedEnv(work) {
  const before = await fs.readFile(bakedRuntimeEnvPath, "utf8").catch(() => null);
  try {
    return await work();
  } finally {
    if (before === null) await fs.rm(bakedRuntimeEnvPath, { force: true });
    else await fs.writeFile(bakedRuntimeEnvPath, before);
  }
}

export async function generateDashboardScreenshot(env = process.env) {
  const databaseUrl = requiredDatabaseUrl(env);
  const schema = screenshotSchemaName();
  const isolatedUrl = isolatedDatabaseUrl(databaseUrl, schema);
  const port = await freePort();
  const origin = `http://${host}:${port}`;
  const runtimeEnv = {
    ...env,
    // ALLOW_INSECURE_FIXED_OTP is deliberately absent: lib/auth/runtime-config.ts refuses to boot
    // with it in a production build and points at the supported pair below, which is exactly what
    // a throwaway demo instance is meant to use. The guard is not worked around, it is obeyed.
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    BETTER_AUTH_URL: origin,
    DATABASE_APPLICATION_NAME: `bisibility-screenshot-${process.pid}`,
    DATABASE_URL: isolatedUrl,
    DEMO_FIXED_OTP: "1",
    DEMO_INSTANCE_INSECURE_AUTH_ACK: "1",
    DEPLOYMENT_ENV: "development",
    DEPLOYMENT_MODE: "self-host",
    DIRECT_URL: isolatedUrl,
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(port),
    SITE_URL: origin,
  };

  let child;
  let schemaCreated = false;
  try {
    await createScreenshotSchema(databaseUrl, schema);
    schemaCreated = true;
    console.log(`Created isolated screenshot schema ${schema}.`);
    await runCommand("npm", ["run", "db:migrate"], runtimeEnv);
    await runCommand("npm", ["run", "db:seed"], runtimeEnv);
    const projectRef = await seededDemoProjectRef(isolatedUrl);
    await prepareScreenshotFixtures(isolatedUrl, projectRef);
    await withPreservedBakedEnv(() => runCommand("npm", ["run", "build"], runtimeEnv));
    child = startNext(port, runtimeEnv);
    await waitForHttp(`${origin}/login`, child);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await captureDashboard(origin, projectRef, outputPath);
    console.log(`Wrote ${path.relative(root, outputPath)}`);
  } finally {
    await stopChild(child);
    if (schemaCreated) {
      await dropScreenshotSchema(databaseUrl, schema);
      console.log(`Dropped isolated screenshot schema ${schema}.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateDashboardScreenshot().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
