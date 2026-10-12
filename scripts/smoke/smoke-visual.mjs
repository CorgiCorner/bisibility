import { spawn } from "node:child_process";
import { createReadStream, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalTestBrowser, attachOperaForTests } from "./attached-opera-playwright.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const staticDir = path.join(root, "storybook-static");
const reportDir = path.join(root, "reports/visual");
const preferredStories = [
  /^Landing\/Hero$/,
  /^Overview\/KpiCard$/,
  /^Keywords\/Workspace$/,
  /^Integrations\/IntegrationCategory$/,
  /^Onboarding\/Wizard$/,
  /^Settings\//,
  /^Docs\//,
  /^Shell\//,
];
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function hasStorybookStatic() {
  try {
    await fs.access(path.join(staticDir, "index.html"));
    await fs.access(path.join(staticDir, "iframe.html"));
    return true;
  } catch {
    return false;
  }
}

function serveFile(request, response) {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(staticDir, rel.slice(1));

  if (!filePath.startsWith(`${staticDir}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(filePath)
    .then((stat) => {
      const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(finalPath)] ?? "application/octet-stream",
      });
      createReadStream(finalPath).pipe(response);
    })
    .catch(() => response.writeHead(404).end("Not found"));
}

function startServer() {
  const server = createServer(serveFile);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ port: typeof address === "object" && address ? address.port : 0, server });
    });
  });
}

async function storyIndex() {
  const raw = await fs.readFile(path.join(staticDir, "index.json"), "utf8");
  const index = JSON.parse(raw);
  return Object.values(index.entries ?? index.stories ?? {}).filter(
    (entry) => entry.type === "story",
  );
}

export function selectStories(stories) {
  const selected = [];
  for (const pattern of preferredStories) {
    const story = stories.find((entry) => pattern.test(entry.title) && !selected.includes(entry));
    if (story) {
      selected.push(story);
    }
  }
  return [...selected, ...stories.filter((entry) => !selected.includes(entry))].slice(0, 8);
}

function fileNameFor(story) {
  return `${story.id.replace(/[^a-z0-9_-]+/gi, "-")}.png`;
}

export async function verifyVisualPng(file, expectedWidth = 1440) {
  const bytes = await fs.readFile(file);
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(16) !== expectedWidth ||
    bytes.readUInt32BE(20) < 1000
  )
    throw new Error(
      "Visual smoke requires the measured full-page PNG dimensions with device scale 1.",
    );
}

export function createVisualBrowser(environment = process.env, attach = attachOperaForTests) {
  let browser;
  let page;
  let attachment;
  return {
    async preflight() {
      await assertLocalTestBrowser(environment);
    },
    async open() {
      if (environment.CI === "true") {
        const { chromium } = await import("@playwright/test");
        browser = await chromium.launch();
        page = await browser.newPage({ viewport: { height: 1000, width: 1440 } });
      } else {
        attachment = await attach();
        const context = await attachment.browser.newContext({
          viewport: { height: 1000, width: 1440 },
          deviceScaleFactor: 1,
        });
        page = await context.newPage();
      }
    },
    async capture(url, file) {
      await page.goto(url, { waitUntil: "networkidle" });
      const dimensions = await page.evaluate(() => ({
        scale: devicePixelRatio,
        width: Math.max(
          document.body?.scrollWidth ?? 0,
          document.documentElement.scrollWidth,
          document.body?.offsetWidth ?? 0,
          document.documentElement.offsetWidth,
          document.body?.clientWidth ?? 0,
          document.documentElement.clientWidth,
        ),
      }));
      if (dimensions.scale !== 1) throw new Error("Visual smoke requires device scale 1.");
      await page.screenshot({ fullPage: true, path: file });
      return dimensions.width;
    },
    async dispose() {
      if (attachment) await attachment.dispose();
      else await browser?.close();
    },
  };
}

async function prepareStatic() {
  if (!(await hasStorybookStatic())) await run("npm", ["run", "build-storybook"]);
  await fs.mkdir(reportDir, { recursive: true });
  return selectStories(await storyIndex());
}

export async function runVisualSmoke({
  browser = createVisualBrowser(),
  prepare = prepareStatic,
  serve = startServer,
  log = console.log,
  verify = verifyVisualPng,
} = {}) {
  // Reject an absent/wrong browser before any potentially expensive Storybook build.
  await browser.preflight();
  const stories = await prepare();
  if (stories.length === 0) throw new Error("No Storybook stories found to render.");
  const { port, server } = await serve();
  try {
    await browser.open();
    for (const story of stories) {
      const url = `http://127.0.0.1:${port}/iframe.html?id=${story.id}&viewMode=story`;
      const file = path.join(reportDir, fileNameFor(story));
      const width = await browser.capture(url, file);
      await verify(file, width);
      log(`Rendered ${story.title} / ${story.name}`);
    }
  } finally {
    try {
      await browser.dispose();
    } finally {
      server.close();
    }
  }
}

export function isMainModule(moduleUrl, script = process.argv[1]) {
  if (!script) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) {
  runVisualSmoke().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
