import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

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
  return Object.values(index.entries ?? index.stories ?? {}).filter((entry) => entry.type === "story");
}

function selectStories(stories) {
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

if (!(await hasStorybookStatic())) {
  await run("npm", ["run", "build-storybook"]);
}

await fs.mkdir(reportDir, { recursive: true });
const stories = selectStories(await storyIndex());
if (stories.length === 0) {
  throw new Error("No Storybook stories found to render.");
}

const { port, server } = await startServer();
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { height: 1000, width: 1440 } });
  for (const story of stories) {
    const url = `http://127.0.0.1:${port}/iframe.html?id=${story.id}&viewMode=story`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.screenshot({ fullPage: true, path: path.join(reportDir, fileNameFor(story)) });
    console.log(`Rendered ${story.title} / ${story.name}`);
  }
} finally {
  await browser.close();
  server.close();
}
