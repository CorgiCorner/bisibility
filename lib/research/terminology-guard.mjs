import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const researchTerminologyRoots = [
  "lib/keyword-research",
  "lib/domain-overview",
  "lib/backlinks",
  "components/research",
  "components/domain-overview",
  "components/backlinks",
];
const researchTerminologyPattern = /\bmarket\b/giu;

function sourceFiles(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.test\.[^/]+$/u.test(entry.name) ? [] : [entryPath];
  });
}

function sourceLocations(source, fileName) {
  return [...source.matchAll(researchTerminologyPattern)].map((match) => {
    const beforeMatch = source.slice(0, match.index);
    return {
      column: beforeMatch.length - beforeMatch.lastIndexOf("\n"),
      fileName,
      line: beforeMatch.split("\n").length,
    };
  });
}

export function researchTerminologyViolations(root) {
  return researchTerminologyRoots
    .flatMap((sourceRoot) => sourceFiles(path.join(root, sourceRoot)))
    .sort()
    .flatMap((fileName) =>
      sourceLocations(readFileSync(fileName, "utf8"), path.relative(root, fileName)),
    );
}

export function assertResearchTerminology(root) {
  const violations = researchTerminologyViolations(root);
  if (violations.length === 0) return;

  const locations = violations
    .map(({ fileName, line, column }) => `${fileName}:${line}:${column}`)
    .join("\n");
  throw new Error(
    `Research modules must use country and language terminology instead of market:\n${locations}`,
  );
}
