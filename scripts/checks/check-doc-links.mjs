#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const DOCS_ROOT = join(ROOT, "docs");
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function docsPageExists(page) {
  const clean = page.replace(/^\/+|\/$/g, "");
  return [join(DOCS_ROOT, `${clean || "index"}.mdx`), join(DOCS_ROOT, clean, "index.mdx")].some(
    existsSync,
  );
}

function deploymentDocsPath(href) {
  if (href === "/docs" || href.startsWith("/docs/")) return href.slice("/docs".length);
  if (href === "https://bisibility.com/docs" || href.startsWith("https://bisibility.com/docs/")) {
    return href.slice("https://bisibility.com/docs".length);
  }
}

function checkDocsHref(source, href) {
  const withoutAnchor = href.split("#", 1)[0].split("?", 1)[0];
  if (!withoutAnchor || withoutAnchor.startsWith("mailto:")) return;
  const sourceRelativeToDocs = relative(DOCS_ROOT, source);
  const isDocsContent = sourceRelativeToDocs !== "" && !sourceRelativeToDocs.startsWith("..");
  const docsPath = deploymentDocsPath(withoutAnchor);
  if (isDocsContent && docsPath !== undefined) {
    failures.push(
      `${relative(ROOT, source)}: docs links must omit the deployment prefix ${href}`,
    );
    return;
  }

  if (docsPath !== undefined) {
    if (!docsPageExists(docsPath)) failures.push(`${relative(ROOT, source)}: missing docs page ${href}`);
    return;
  }

  if (isDocsContent && withoutAnchor.startsWith("/") && !withoutAnchor.startsWith("/api/")) {
    if (!docsPageExists(withoutAnchor)) {
      failures.push(`${relative(ROOT, source)}: missing docs page ${href}`);
    }
    return;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(withoutAnchor) || withoutAnchor.startsWith("/")) return;

  const target = resolve(dirname(source), withoutAnchor);
  if (!existsSync(target)) failures.push(`${relative(ROOT, source)}: missing file ${href}`);
}

const contentFiles = [join(ROOT, "README.md"), ...walk(DOCS_ROOT)].filter((file) =>
  [".md", ".mdx"].includes(extname(file)),
);

for (const file of contentFiles) {
  const content = readFileSync(file, "utf8");
  const hrefs = [
    ...content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g),
    ...content.matchAll(/\bhref=["']([^"']+)["']/g),
  ].map((match) => match[1]);
  for (const href of hrefs) checkDocsHref(file, href);
}

function checkDocsRoute(route, location) {
  if (route === "/docs" || route.startsWith("/docs/")) {
    failures.push(`${location}: docs routes must omit the deployment prefix ${route}`);
  }
}

const config = JSON.parse(readFileSync(join(DOCS_ROOT, "docs.json"), "utf8"));
for (const tab of config.navigation?.tabs ?? []) {
  for (const group of tab.groups ?? []) {
    for (const page of group.pages ?? []) {
      if (!docsPageExists(page)) failures.push(`docs/docs.json: missing navigation page ${page}`);
    }
  }
}

for (const [index, redirect] of (config.redirects ?? []).entries()) {
  const location = `docs/docs.json: redirects[${index}]`;
  checkDocsRoute(redirect.source, location);
  checkDocsRoute(redirect.destination, location);
  if (redirect.destination.startsWith("/") && !docsPageExists(redirect.destination)) {
    failures.push(`${location}: missing redirect destination ${redirect.destination}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Documentation links valid across ${contentFiles.length} files.`);
