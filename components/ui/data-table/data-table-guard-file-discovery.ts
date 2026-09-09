import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, type Stats } from "node:fs";
import path from "node:path";

type SourcePathMatcher = (path: string) => boolean;

const skippedDirectoryNames = new Set([".cache", ".next", ".turbo", "node_modules"]);

function isMissingPath(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function hasLocalGitMetadata(repoRoot: string) {
  lstatSync(repoRoot);
  try {
    lstatSync(path.join(repoRoot, ".git"));
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

function repositoryRelativePath(repoRoot: string, file: string) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function isSkippedDirectory(name: string, relativePath: string) {
  return skippedDirectoryNames.has(name) || relativePath === "lib/generated";
}

function readFilesystemSourcePaths(
  repoRoot: string,
  roots: readonly string[],
  matchesSource: SourcePathMatcher,
) {
  const paths: string[] = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;

      const file = path.join(directory, entry.name);
      const relativePath = repositoryRelativePath(repoRoot, file);
      if (entry.isDirectory()) {
        if (!isSkippedDirectory(entry.name, relativePath)) walk(file);
      } else if (entry.isFile() && matchesSource(relativePath)) {
        paths.push(relativePath);
      }
    }
  }

  for (const root of roots) {
    const directory = path.join(repoRoot, root);
    let metadata: Stats;
    try {
      metadata = lstatSync(directory);
    } catch (error) {
      if (isMissingPath(error)) continue;
      throw error;
    }
    if (metadata.isSymbolicLink()) continue;
    if (metadata.isDirectory()) {
      walk(directory);
    } else if (metadata.isFile() && matchesSource(root)) {
      paths.push(root.split(path.sep).join("/"));
    }
  }

  return paths.sort();
}

function readGitTrackedSourcePaths(
  repoRoot: string,
  roots: readonly string[],
  matchesSource: SourcePathMatcher,
) {
  return execFileSync(
    "git",
    [
      "--git-dir",
      path.resolve(repoRoot, ".git"),
      "--work-tree",
      path.resolve(repoRoot),
      "ls-files",
      "-z",
      "--",
      ...roots,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(matchesSource)
    .sort();
}

export function readDataTableGuardSourcePaths(
  repoRoot: string,
  roots: readonly string[],
  matchesSource: SourcePathMatcher,
) {
  return hasLocalGitMetadata(repoRoot)
    ? readGitTrackedSourcePaths(repoRoot, roots, matchesSource)
    : readFilesystemSourcePaths(repoRoot, roots, matchesSource);
}
