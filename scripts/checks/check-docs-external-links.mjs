#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const docsRoot = join(root, "docs");
const allowBroken = new Set(
  (process.env.DOCS_EXTERNAL_LINK_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function collectHrefs(file) {
  const content = readFileSync(file, "utf8");
  return [
    ...content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g),
    ...content.matchAll(/\bhref=["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

async function checkUrl(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: attempt === 0 ? "HEAD" : "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 405 && attempt === 0) continue;
      if (response.status >= 200 && response.status < 400) return null;
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      return `HTTP ${response.status}`;
    } catch (error) {
      if (attempt === 2) return error instanceof Error ? error.message : String(error);
    }
  }
  return "no successful response";
}

const files = [join(root, "README.md"), ...walk(docsRoot)].filter((file) =>
  [".md", ".mdx"].includes(extname(file)),
);
const urls = new Map();
for (const file of files) {
  for (const href of collectHrefs(file)) {
    if (!/^https?:\/\//i.test(href.split("#", 1)[0])) continue;
    const url = href.split("#", 1)[0];
    const sources = urls.get(url) ?? [];
    sources.push(relative(root, file));
    urls.set(url, sources);
  }
}

const failures = [];
if (process.env.DOCS_CHECK_EXTERNAL !== "1") {
  console.log(
    `Collected ${urls.size} unique external docs URLs. Set DOCS_CHECK_EXTERNAL=1 to HTTP-validate them.`,
  );
} else {
  for (const [url, sources] of urls) {
    if (allowBroken.has(url)) continue;
    const error = await checkUrl(url);
    if (error) failures.push(`${sources[0]}: ${url} ${error}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
