import { readdirSync, readFileSync } from "node:fs";
import { extname, join, posix, relative, sep } from "node:path";

const HTTP_OPERATION = /^(?:DELETE|GET|PATCH|POST|PUT) \//;
const PRIVATE_DOCS_DIRECTORIES = new Set(["plans", "private"]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
}

function portablePath(path) {
  return path.split(sep).join(posix.sep);
}

function pageIdFromPath(docsRoot, file) {
  return portablePath(relative(docsRoot, file))
    .replace(/\.mdx?$/, "")
    .replace(/(?:^|\/)index$/, "");
}

function isPublishedDocsSource(docsRoot, file) {
  if (![".md", ".mdx"].includes(extname(file))) return false;
  const [topLevelDirectory] = portablePath(relative(docsRoot, file)).split("/");
  return !PRIVATE_DOCS_DIRECTORIES.has(topLevelDirectory);
}

export function loadPublishedDocsPages(docsRoot) {
  return new Map(
    walk(docsRoot)
      .filter((file) => isPublishedDocsSource(docsRoot, file))
      .map((file) => [pageIdFromPath(docsRoot, file), { file, source: readFileSync(file, "utf8") }]),
  );
}

export function collectNavigationPageIds(navigation) {
  const pages = new Set();

  function visit(value, isPages = false) {
    if (typeof value === "string") {
      if (isPages && !HTTP_OPERATION.test(value)) pages.add(normalizePageId(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, isPages);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) visit(entry, key === "pages");
  }

  visit(navigation);
  return pages;
}

export function extractDocHrefs(source, includePlainUrls = false) {
  const matches = [
    ...source.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g),
    ...source.matchAll(/\bhref=["']([^"']+)["']/g),
  ];
  if (includePlainUrls) {
    matches.push(
      ...source.matchAll(
        /(https:\/\/bisibility\.com\/docs(?:\/[A-Za-z0-9_./{}-]*)?(?:#[A-Za-z0-9_.%-]+)?)/g,
      ),
    );
  }
  return [...new Set(matches.map((match) => match[1]))];
}

export function normalizePageId(value) {
  const clean = value.replace(/^\/+|\/+$/g, "").replace(/\.mdx?$/, "");
  return clean.replace(/(?:^|\/)index$/, "");
}

export function resolveDocsHref(href, sourcePageId, knownPageIds) {
  let value = href;
  if (value === "https://bisibility.com/docs" || value.startsWith("https://bisibility.com/docs/")) {
    value = value.slice("https://bisibility.com/docs".length) || "/";
  } else if (value === "/docs" || value.startsWith("/docs/")) {
    value = value.slice("/docs".length) || "/";
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
    return;
  }

  const [pathWithQuery, rawFragment] = value.split("#", 2);
  const pathname = pathWithQuery.split("?", 1)[0];
  let pageId;
  if (!pathname) {
    pageId = sourcePageId;
  } else if (pathname.startsWith("/")) {
    pageId = normalizePageId(pathname);
  } else {
    pageId = normalizePageId(posix.normalize(posix.join(posix.dirname(sourcePageId), pathname)));
  }
  if (!knownPageIds.has(pageId)) return;

  let fragment;
  try {
    fragment = rawFragment === undefined ? undefined : decodeURIComponent(rawFragment);
  } catch {
    fragment = rawFragment;
  }
  return { pageId, fragment };
}

export function headingSlug(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function headingAnchor(value) {
  const customId = value.match(/\s+\{#([^{}\s]+)\}\s*$/);
  return customId?.[1] ?? headingSlug(value);
}

export function pageAnchors(source) {
  const content = source.replace(/^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)\s*$/gm, "");
  const anchors = new Set();
  for (const match of content.matchAll(/\bid=["']([^"']+)["']/g)) anchors.add(match[1]);

  const occurrences = new Map();
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = headingAnchor(match[1]);
    if (!base) continue;
    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

export function analyzeDocsNavigation(pages, navigation) {
  const knownPageIds = new Set(pages.keys());
  const reachable = new Set();
  const pending = [...collectNavigationPageIds(navigation)];
  const missingFragments = [];

  while (pending.length) {
    const pageId = pending.shift();
    if (reachable.has(pageId) || !knownPageIds.has(pageId)) continue;
    reachable.add(pageId);
    const page = pages.get(pageId);
    for (const href of extractDocHrefs(page.source)) {
      const target = resolveDocsHref(href, pageId, knownPageIds);
      if (!target) continue;
      if (!reachable.has(target.pageId)) pending.push(target.pageId);
    }
  }

  const anchors = new Map([...pages].map(([pageId, page]) => [pageId, pageAnchors(page.source)]));
  for (const [sourcePageId, page] of pages) {
    for (const href of extractDocHrefs(page.source, true)) {
      const target = resolveDocsHref(href, sourcePageId, knownPageIds);
      if (!target?.fragment) continue;
      if (!anchors.get(target.pageId).has(target.fragment)) {
        missingFragments.push({
          sourceFile: page.file,
          href,
          targetPageId: target.pageId,
          fragment: target.fragment,
        });
      }
    }
  }

  return {
    orphanPageIds: [...knownPageIds].filter((pageId) => !reachable.has(pageId)).sort(),
    missingFragments,
  };
}

export const docsNavigationExclusions = [...PRIVATE_DOCS_DIRECTORIES].sort();
