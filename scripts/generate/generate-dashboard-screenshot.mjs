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
import { chromium } from "@playwright/test";
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
const demoEmail = "demo@acme.dev";
const demoOtp = "000000";
// 1680 rather than a laptop's 1440: the highlight grid is `auto-fit minmax(300px, 1fr)`, so at
// 1440 its fourth card wraps to a second row and adds roughly 400px of height to the image. At
// 1680 all four sit on one row, which keeps the capture landscape - the shape a README leads with.
const captureWidth = 1680;
// A ceiling, not a target. It keeps a runaway page - an unexpected seed, a broken layout - from
// producing an image nobody can look at, while leaving room for the overview to grow.
const maxCaptureHeight = 1800;

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

async function waitForAuthResult(target, page, failurePrefix) {
  const errorMessage = page.locator(".text-red-text").filter({ hasText: /\S/ }).first();
  await Promise.race([
    target,
    errorMessage.waitFor({ state: "visible" }).then(async () => {
      throw new Error(`${failurePrefix}: ${await errorMessage.innerText()}`);
    }),
  ]);
}

async function captureDashboard(origin, browser, projectRef) {
  const dashboardPath = `/app/${projectRef}/dashboard`;
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { height: 980, width: captureWidth },
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(`${origin}/login?next=${encodeURIComponent(dashboardPath)}`, {
    waitUntil: "networkidle",
  });
  const email = page.locator("#login-email");
  await email.waitFor({ state: "visible" });
  await email.fill(demoEmail);
  await page.getByRole("button", { name: "Send login code" }).click();
  const firstOtpDigit = page.getByLabel("Code", { exact: true });
  await waitForAuthResult(
    firstOtpDigit.waitFor({ state: "visible" }),
    page,
    "Requesting the demo sign-in code failed",
  );
  await firstOtpDigit.pressSequentially(demoOtp);
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await waitForAuthResult(
    page.waitForURL((url) => url.pathname === dashboardPath, { timeout: 30_000 }),
    page,
    "Demo sign-in failed",
  );

  // A production navigation keeps the outgoing shell in the tree, hidden, while the incoming one
  // paints, so the bare attribute matches twice and a strict locator refuses to choose. Match the
  // visible one: it is the shell being photographed.
  const shell = page.locator("[data-shell-root]:visible");
  await shell.first().waitFor({ state: "visible" });
  await page
    .getByRole("heading", { name: "Dashboard", exact: true })
    .waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Switch project" })
    .getByText("Demo", { exact: true })
    .waitFor();
  await page.getByText("20 keywords", { exact: true }).first().waitFor({ state: "visible" });
  await page
    .getByRole("button", { exact: true, name: "Markets" })
    .waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "By market" }).waitFor({ state: "visible" });
  await page
    .getByText("3 active markets / paused markets excluded", { exact: true })
    .waitFor({ state: "visible" });
  await page.locator(".MuiAreaElement-root").first().waitFor({ state: "visible" });
  await page.locator(".MuiBarElement-root").first().waitFor({ state: "visible" });

  // The overview is taller than the reading viewport, and a capture that stops at 980px slices the
  // highlight cards in half. Grow the viewport to the height the page actually needs, then let the
  // charts settle at that size before the shutter: they are responsive, so measuring once and
  // shooting immediately would photograph a mid-resize frame.
  const contentHeight = await page.evaluate(() => {
    // The whole document, not just <main>: the instance footer sits outside it, and measuring
    // main alone sliced that strip off the bottom edge.
    const { scrollHeight } = document.documentElement;
    return scrollHeight > 0 ? Math.ceil(scrollHeight) : null;
  });
  if (!contentHeight) throw new Error("Could not measure the overview height to frame the capture.");
  await page.setViewportSize({ height: Math.min(contentHeight, maxCaptureHeight), width: captureWidth });
  await page.locator(".MuiAreaElement-root").first().waitFor({ state: "visible" });
  await page.locator(".MuiBarElement-root").first().waitFor({ state: "visible" });

  await page.evaluate(() => document.fonts?.ready);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ animations: "disabled", omitBackground: false, path: outputPath });
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

  let browser;
  let child;
  let schemaCreated = false;
  try {
    await createScreenshotSchema(databaseUrl, schema);
    schemaCreated = true;
    console.log(`Created isolated screenshot schema ${schema}.`);
    await runCommand("npx", ["prisma", "migrate", "deploy"], runtimeEnv);
    await runCommand("npm", ["run", "db:seed"], runtimeEnv);
    const projectRef = await seededDemoProjectRef(isolatedUrl);
    await withPreservedBakedEnv(() => runCommand("npm", ["run", "build"], runtimeEnv));
    child = startNext(port, runtimeEnv);
    await waitForHttp(`${origin}/login`, child);
    browser = await chromium.launch();
    await captureDashboard(origin, browser, projectRef);
    console.log(`Wrote ${path.relative(root, outputPath)}`);
  } finally {
    if (browser) await browser.close();
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
