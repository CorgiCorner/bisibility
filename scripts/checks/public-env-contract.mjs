import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { scanRuntimeEnvNames } from "./public-env-scanner.mjs";
import {
  classifiedAllowlist,
  envClassification,
  primaryCategories,
} from "./public-env-classification.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function parseStarterNames(source) {
  const names = new Set();
  for (const line of source.split("\n")) {
    const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
    if (match) names.add(match[1]);
  }
  return names;
}

export function parseDocsNames(source) {
  const specific = new Set();
  const wildcards = new Set();
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s-]+\|/.test(trimmed)) continue;
    const cols = trimmed.split("|");
    if (cols.length < 3) continue;
    const firstCol = cols[1] ?? "";
    for (const m of firstCol.matchAll(/`([A-Z][A-Z0-9_*]+)`/g)) {
      const name = m[1];
      if (name.includes("*")) wildcards.add(name);
      else specific.add(name);
    }
  }
  return { specific, wildcards };
}

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp - pattern derives from committed docs tables and is regex-escaped.
}

export function docsCoversName(docs, name) {
  if (docs.specific.has(name)) return true;
  for (const pattern of docs.wildcards) {
    if (globToRegex(pattern).test(name)) return true;
  }
  return false;
}

export function validateContract({
  runtimeNames,
  starterNames,
  registryNames,
  docsNames,
}) {
  const errors = [];
  const allowlist = classifiedAllowlist();

  for (const name of registryNames ?? starterNames) {
    if (!docsCoversName(docsNames, name)) {
      errors.push(`Registry variable ${name} is not documented in configuration.mdx`);
    }
  }

  const publicNames = registryNames ?? starterNames;
  for (const name of runtimeNames) {
    if (publicNames.has(name)) continue;
    if (allowlist.has(name)) continue;
    if (docsNames.specific.has(name)) continue;
    errors.push(
      `Runtime variable ${name} is not in the public registry, specific docs entry, or any classification allowlist. Add it to the registry and docs, or classify it in public-env-classification.mjs.`,
    );
  }

  if (registryNames) {
    for (const name of starterNames) {
      if (!registryNames.has(name)) {
        errors.push(`Public starter variable ${name} is not in the public registry.`);
      }
    }
  }

  for (const name of envClassification.hostedOnly) {
    if (docsNames.specific.has(name)) {
      errors.push(`Hosted-only variable ${name} must not appear in public configuration docs.`);
    }
  }
  for (const name of envClassification.docsOnly) {
    if (!docsCoversName(docsNames, name)) {
      errors.push(`Docs-only variable ${name} is not documented in configuration.mdx.`);
    }
  }

  for (let i = 0; i < primaryCategories.length; i++) {
    for (let j = i + 1; j < primaryCategories.length; j++) {
      const a = envClassification[primaryCategories[i]];
      const b = envClassification[primaryCategories[j]];
      const overlap = a.filter((n) => b.includes(n));
      if (overlap.length > 0) {
        errors.push(`Primary categories ${primaryCategories[i]} and ${primaryCategories[j]} overlap: ${overlap.join(", ")}`);
      }
    }
  }

  if (registryNames) {
    for (const name of registryNames) {
      for (const cat of primaryCategories) {
        if (envClassification[cat].includes(name)) {
          errors.push(`Registry variable ${name} also appears in classification ${cat}.`);
        }
      }
    }
  }

  return errors;
}

async function loadRegistryNames(registryRelativePath) {
  if (!registryRelativePath) return null;
  const registryPath = resolveRepoRelativePath(registryRelativePath, "Injected env registry");
  if (!existsSync(registryPath)) {
    throw new Error("Injected env registry does not exist.");
  }
  const mod = await import(pathToFileURL(registryPath).href);
  if (!Array.isArray(mod.publicEnvironmentRegistry)) {
    throw new Error("Injected env registry must export publicEnvironmentRegistry as an array.");
  }
  for (const entry of mod.publicEnvironmentRegistry) {
    if (!entry || typeof entry.name !== "string") {
      throw new Error("Injected env registry entries must have a string name property.");
    }
  }
  return new Set(mod.publicEnvironmentRegistry.map((e) => e.name));
}

function loadStarterNames(starterRelativePath) {
  const starterPath = path.join(root, starterRelativePath);
  return parseStarterNames(readFileSync(starterPath, "utf8"));
}

export async function checkPublicEnvContract({
  starterRelativePath = ".env.example",
  registryRelativePath = null,
} = {}) {
  const runtimeNames = new Set(scanRuntimeEnvNames());
  const starterNames = loadStarterNames(starterRelativePath);
  const docsSource = readFileSync(
    path.join(root, "docs/self-hosting/configuration.mdx"),
    "utf8",
  );
  const docsNames = parseDocsNames(docsSource);
  const registryNames = await loadRegistryNames(registryRelativePath);

  const errors = validateContract({
    runtimeNames,
    starterNames,
    registryNames,
    docsNames,
  });
  if (errors.length > 0) {
    console.error(`Public env contract failed:\n${errors.join("\n")}`);
    process.exitCode = 1;
    return;
  }
  console.log("Public env contract passed.");
}

function resolveRepoRelativePath(value, label) {
  if (!value || path.isAbsolute(value)) {
    throw new Error(`${label} requires a repo-relative path.`);
  }
  const resolved = path.resolve(root, value);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} requires a path inside the repository.`);
  }
  return resolved;
}

function repoRelativePathFromArgs(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  resolveRepoRelativePath(value, flag);
  return value;
}

function starterPathFromArgs(args) {
  return repoRelativePathFromArgs(args, "--starter", ".env.example");
}

export function registryPathFromArgs(args) {
  const relativePath = repoRelativePathFromArgs(args, "--registry", null);
  if (relativePath && !existsSync(path.resolve(root, relativePath))) {
    throw new Error("--registry path does not exist.");
  }
  return relativePath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  checkPublicEnvContract({
    starterRelativePath: starterPathFromArgs(args),
    registryRelativePath: registryPathFromArgs(args),
  });
}
