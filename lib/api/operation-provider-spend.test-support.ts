import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A static import graph of `lib/` (static and dynamic string imports, `@/` and relative paths),
 * for checking that an operation's handler reaches the code that bills a provider or queues
 * billed work. Reachability over-approximates what one request does, so it is a necessary
 * condition, not proof that a given request spends.
 */

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const testFile = /\.test\.|test-support|test-fixture|test-process|test-ports|\.stories\./;

function sourceFiles(directory: string, files: string[] = []) {
  for (const name of readdirSync(directory)) {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) sourceFiles(file, files);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !testFile.test(name)) files.push(file);
  }
  return files;
}

function resolveImport(from: string, specifier: string) {
  const base = specifier.startsWith("@/")
    ? path.join(repositoryRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(from), specifier)
      : undefined;
  if (!base) return undefined;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts")].find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

export function importGraph() {
  const sources = new Map<string, string>();
  const edges = new Map<string, Set<string>>();
  for (const file of sourceFiles(path.join(repositoryRoot, "lib"))) {
    const relative = path.relative(repositoryRoot, file);
    const source = readFileSync(file, "utf8");
    sources.set(relative, source);
    const targets = new Set<string>();
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
      const target = resolveImport(file, match[1]);
      if (target) targets.add(path.relative(repositoryRoot, target));
    }
    edges.set(relative, targets);
  }
  const reachable = (start: string) => {
    const seen = new Set([start]);
    const stack = [start];
    for (let next = stack.pop(); next; next = stack.pop()) {
      for (const target of edges.get(next) ?? []) {
        if (!seen.has(target)) {
          seen.add(target);
          stack.push(target);
        }
      }
    }
    return seen;
  };
  return { reachable, sources };
}

/** Modules that attribute a provider-billed request (every billed request is tagged). */
export function billedRequestSites(sources: Map<string, string>) {
  return [...sources]
    .filter(
      ([file, source]) =>
        file !== "lib/provider-usage/tag.ts" &&
        /\b(createProviderRequestAttribution|buildProviderTag)\(/.test(source),
    )
    .map(([file]) => file)
    .sort();
}
