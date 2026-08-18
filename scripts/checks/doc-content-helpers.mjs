import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const contractSourceExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".ts",
  ".tsx",
]);

export const SLACK_PREVIEW_CONTRACT =
  "Slack tenant delivery is available as an API-only preview. Workspace installation and channel management are not yet exposed in the dashboard.";

export function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function findContractSourceReferences(root, needle) {
  const matches = [];
  for (const directory of ["app", "components", "docs", "lib", "scripts"]) {
    for (const file of walk(join(root, directory))) {
      if (!contractSourceExtensions.has(extname(file))) continue;
      if (readFileSync(file, "utf8").includes(needle)) matches.push(relative(root, file));
    }
  }
  return matches;
}

export function checkSlackPreviewContract(sources) {
  return sources.flatMap(({ label, source }) =>
    source.replaceAll(/\s+/g, " ").trim().includes(SLACK_PREVIEW_CONTRACT)
      ? []
      : [`${label} is missing the exact Slack API-only preview contract.`],
  );
}

export function extractListBullet(source, markerRegex) {
  const lines = source.split("\n");
  let startIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (markerRegex.test(lines[i])) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === -1) return null;
  const bullet = [lines[startIndex]];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === "") break;
    if (/^\s/.test(line)) {
      bullet.push(line);
    } else {
      break;
    }
  }
  return bullet.join("\n");
}

export function checkDomainOverviewContract(readmeSource) {
  const failures = [];
  const bullet = extractListBullet(readmeSource, /^-\s+Domain overview/i);
  if (!bullet) {
    failures.push("README.md is missing the Domain Overview feature bullet.");
    return failures;
  }
  const normalized = bullet.replaceAll(/\s+/g, " ");
  for (const term of [
    "requires a bring-your-own DataForSEO connection",
    "metered",
    "The app and REST API are available",
    "SDK, CLI, and MCP parity is still in progress",
  ]) {
    if (!normalized.includes(term)) {
      failures.push(`README.md Domain Overview bullet is missing settled contract: ${term}`);
    }
  }
  if (/planned|not yet/i.test(normalized)) {
    failures.push("README.md must not describe Domain Overview as planned or not yet.");
  }
  return failures;
}
