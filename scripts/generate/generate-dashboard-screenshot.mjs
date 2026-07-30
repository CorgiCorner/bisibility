import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const host = "127.0.0.1";
const route = "/screenshots/dashboard-overview-mock";
const outputPath = path.join(root, "public/screenshots/dashboard-overview.png");

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
      if (settled) {
        return;
      }
      if (Date.now() > deadline) {
        settled = true;
        reject(new Error(`Timed out waiting for ${url}.`));
        return;
      }
      setTimeout(probe, 750);
    }

    function probe() {
      if (settled) {
        return;
      }
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

function startNext(port) {
  return spawn("npm", ["run", "dev", "--", "--hostname", host, "--port", String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
}

const port = await freePort();
const url = `http://${host}:${port}${route}`;
const child = startNext(port);

let browser;
try {
  await waitForHttp(url, child);
  browser = await chromium.launch();
  const page = await browser.newPage({
    deviceScaleFactor: 2,
    viewport: { height: 980, width: 1440 },
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const target = page.locator("[data-dashboard-screenshot]");
  await target.waitFor({ state: "visible" });
  await page.locator(".MuiLineElement-root").first().waitFor({ state: "visible" });
  await page.locator(".MuiBarElement-root").first().waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await target.screenshot({ animations: "disabled", omitBackground: false, path: outputPath });
  console.log(`Wrote ${path.relative(root, outputPath)}`);
} finally {
  if (browser) {
    await browser.close();
  }
  child.kill("SIGTERM");
}
