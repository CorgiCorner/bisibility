import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { collectNavigationPageIds } from "./doc-navigation.mjs";

function slug(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function deployedOpenApiMatches(expected, actual) {
  return isDeepStrictEqual(expected, actual);
}

export function expectedDocsInventory({ docsRoot }) {
  const config = JSON.parse(readFileSync(join(docsRoot, "docs.json"), "utf8"));
  const openapi = JSON.parse(readFileSync(join(docsRoot, "openapi.snapshot.json"), "utf8"));
  const authored = [...collectNavigationPageIds(config.navigation)].map((page) => page || "index");
  const reference = [];
  for (const pathItem of Object.values(openapi.paths ?? {})) {
    for (const operation of Object.values(pathItem ?? {})) {
      if (!operation || typeof operation !== "object" || !operation.summary) continue;
      const tag = operation.tags?.[0] ?? "api";
      reference.push(`api-reference/${slug(tag)}/${slug(operation.summary)}`);
    }
  }
  return { authored, reference };
}

export function parseLlmsTxt(text) {
  const hrefs = [];
  for (const match of text.matchAll(/\((https?:\/\/[^)]+|\/docs\/[^)]+)\)/g)) {
    const href = match[1].replace(/\.mdx?$/, "").replace(/\/$/, "");
    const path = href.replace(/^https?:\/\/[^/]+/, "");
    if (path.startsWith("/docs/")) hrefs.push(path.slice("/docs/".length));
  }
  return [...new Set(hrefs)];
}

export function diffDocsInventory(expected, livePaths) {
  const expectedPaths = new Set([
    ...expected.authored,
    ...expected.reference,
    "index",
    "openapi.snapshot.json",
  ]);
  const live = new Set(
    livePaths
      .map((path) => path.replace(/^\/+/, "").replace(/\/index$/, "") || "index")
      .filter((path) => path !== "llms" && path !== "sitemap.xml"),
  );
  const missingFromLive = [...expectedPaths].filter((path) => {
    if (path.startsWith("api-reference/")) {
      return ![...live].some((item) => item === path || item.startsWith(`${path}/`));
    }
    return !live.has(path) && !live.has(`${path}/index`);
  });
  const extraInLive = [...live].filter((path) => {
    if (path.startsWith("api-reference/")) {
      return !expected.reference.includes(path);
    }
    return !expectedPaths.has(path);
  });
  return { extraInLive, missingFromLive };
}
