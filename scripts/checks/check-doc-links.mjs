#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import {
  analyzeDocsNavigation,
  docsNavigationExclusions,
  loadPublishedDocsPages,
} from "./doc-navigation.mjs";

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
  return [
    join(DOCS_ROOT, `${clean || "index"}.md`),
    join(DOCS_ROOT, `${clean || "index"}.mdx`),
    join(DOCS_ROOT, clean, "index.md"),
    join(DOCS_ROOT, clean, "index.mdx"),
  ].some(existsSync);
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

  if (isDocsContent && withoutAnchor.startsWith("/")) {
    if (docsPageExists(withoutAnchor)) return;
    const message = withoutAnchor.startsWith("/api/")
      ? `application API links must use an absolute URL when docs are mounted at /docs ${href}`
      : `missing docs page ${href}`;
    failures.push(`${relative(ROOT, source)}: ${message}`);
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
const publishedDocsPages = loadPublishedDocsPages(DOCS_ROOT);
const docsNavigation = analyzeDocsNavigation(publishedDocsPages, config.navigation);
for (const pageId of docsNavigation.orphanPageIds) {
  failures.push(
    `${relative(ROOT, publishedDocsPages.get(pageId).file)}: orphan documentation page is not reachable from docs/docs.json navigation`,
  );
}
for (const missing of docsNavigation.missingFragments) {
  failures.push(
    `${relative(ROOT, missing.sourceFile)}: missing fragment target ${missing.href}`,
  );
}
const docsTab = config.navigation?.tabs?.find((tab) => tab.tab === "Docs");
const apiWorkflowGroup = docsTab?.groups?.find((group) => group.group === "API workflows");
const expectedApiWorkflows = [
  "api/overview",
  "api/checks",
  "api/rank-history",
  "api/webhooks",
  "api/deploy-webhooks",
  "api/cloud-import",
  "api/errors",
];
if (JSON.stringify(apiWorkflowGroup?.pages) !== JSON.stringify(expectedApiWorkflows)) {
  failures.push(
    "docs/docs.json: API workflows must contain only cross-endpoint integration guides",
  );
}
const apiReferenceTab = config.navigation?.tabs?.find((tab) => tab.tab === "API Reference");
if (apiReferenceTab?.openapi !== "openapi.snapshot.json") {
  failures.push(
    "docs/docs.json: API Reference tab must render endpoints from openapi.snapshot.json",
  );
} else if (!existsSync(join(DOCS_ROOT, apiReferenceTab.openapi))) {
  failures.push(`docs/docs.json: missing OpenAPI source ${apiReferenceTab.openapi}`);
} else {
  const openapi = JSON.parse(readFileSync(join(DOCS_ROOT, apiReferenceTab.openapi), "utf8"));
  const tagLabels = new Map(
    (openapi.tags ?? []).map((tag) => [tag.name, tag["x-group"] ?? tag.name]),
  );
  const expectedGroupNames = [...tagLabels.values()];
  const actualGroupNames = (apiReferenceTab.groups ?? []).map((group) => group.group);
  if (JSON.stringify(actualGroupNames) !== JSON.stringify(expectedGroupNames)) {
    failures.push("docs/docs.json: API Reference group order must match OpenAPI tag order");
  }

  const endpointGroups = new Map();

  for (const [path, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["delete", "get", "patch", "post", "put"].includes(method)) continue;
      const tag = operation.tags?.[0];
      const group = tagLabels.get(tag);
      if (!group) {
        failures.push(
          `docs/${apiReferenceTab.openapi}: ${method.toUpperCase()} ${path} has no group`,
        );
        continue;
      }
      endpointGroups.set(`${method.toUpperCase()} ${path}`, group);
    }
  }

  const configuredEndpoints = new Set();
  for (const group of apiReferenceTab.groups ?? []) {
    for (const page of group.pages ?? []) {
      if (!endpointGroups.has(page)) {
        failures.push(`docs/docs.json: unknown API Reference endpoint ${page}`);
        continue;
      }
      if (configuredEndpoints.has(page)) {
        failures.push(`docs/docs.json: duplicate API Reference endpoint ${page}`);
      }
      configuredEndpoints.add(page);
      if (endpointGroups.get(page) !== group.group) {
        failures.push(`docs/docs.json: ${page} belongs in ${endpointGroups.get(page)}`);
      }
    }
  }
  if (configuredEndpoints.size !== endpointGroups.size) {
    failures.push(
      `docs/docs.json: API Reference lists ${configuredEndpoints.size} of ${endpointGroups.size} endpoints`,
    );
  }
}

for (const tab of config.navigation?.tabs ?? []) {
  for (const group of tab.groups ?? []) {
    for (const page of group.pages ?? []) {
      if (/^(?:DELETE|GET|PATCH|POST|PUT) \//.test(page)) continue;
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

console.log(
  `Documentation links valid across ${contentFiles.length} files; public pages exclude docs/${docsNavigationExclusions.join(" and docs/")}.`,
);
